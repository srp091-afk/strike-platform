import { createHmac, timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAN_NAMES = ["starter", "pro", "agency"] as const;

const SUBSCRIPTION_EVENTS = [
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_resumed",
  "subscription_expired",
] as const;

type SubscriptionEvent = (typeof SUBSCRIPTION_EVENTS)[number];
type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function isSubscriptionEvent(event: string): event is SubscriptionEvent {
  return (SUBSCRIPTION_EVENTS as readonly string[]).includes(event);
}

function validSignature(rawBody: string, signature: string | null) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Тариф определяем по названию продукта/варианта из Lemon Squeezy. */
function planFrom(attributes: Json) {
  const label = `${text(attributes.product_name)} ${text(attributes.variant_name)}`.toLowerCase();
  return PLAN_NAMES.find((plan) => label.includes(plan)) ?? null;
}

/** Статус Lemon Squeezy → profiles.subscription_status. Пробный период считается активной подпиской. */
function statusFrom(attributes: Json) {
  const status = text(attributes.status);
  switch (status) {
    case "cancelled":
    case "expired":
    case "past_due":
    case "unpaid":
    case "paused":
      return status;
    default:
      return "active";
  }
}

/** Пополнение Flex: по ID варианта (если задан) либо по названию продукта. */
function isFlexOrder(attributes: Json) {
  const item = asRecord(attributes.first_order_item);
  const flexVariant = process.env.LEMONSQUEEZY_FLEX_VARIANT_ID;
  if (flexVariant && text(item.variant_id) === flexVariant) return true;
  return `${text(item.product_name)} ${text(item.variant_name)}`.toLowerCase().includes("flex");
}

/** Владелец подписки: user_id из custom data, иначе поиск по id подписки. */
async function resolveSubscriptionUser(admin: SupabaseClient, customUserId: string, subscriptionId: string) {
  if (UUID_PATTERN.test(customUserId)) return customUserId;
  if (!subscriptionId) return null;
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("lemon_subscription_id", subscriptionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return typeof data?.id === "string" ? data.id : null;
}

async function applySubscriptionEvent(
  admin: SupabaseClient,
  event: SubscriptionEvent,
  userId: string,
  subscriptionId: string,
  attributes: Json,
) {
  const base = {
    id: userId,
    lemon_subscription_id: subscriptionId,
    lemon_customer_id: text(attributes.customer_id) || undefined,
  };

  let patch: Json;
  switch (event) {
    case "subscription_created":
    case "subscription_updated":
    case "subscription_resumed": {
      const status = event === "subscription_resumed" ? "active" : statusFrom(attributes);
      const plan = status === "expired" ? "free" : planFrom(attributes);
      patch = {
        ...base,
        ...(plan ? { plan } : {}),
        subscription_status: status,
        plan_renews_at: text(attributes.renews_at) || null,
      };
      break;
    }
    case "subscription_cancelled":
      // Доступ сохраняется до конца оплаченного периода (ends_at).
      patch = {
        ...base,
        subscription_status: "cancelled",
        plan_renews_at: text(attributes.ends_at) || text(attributes.renews_at) || null,
      };
      break;
    case "subscription_expired":
      patch = { ...base, plan: "free", subscription_status: "expired", plan_renews_at: null };
      break;
  }

  const { error } = await admin.from("profiles").upsert(patch, { onConflict: "id" });
  if (error) throw new Error(error.message);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-signature"))) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Json;
  try {
    payload = asRecord(JSON.parse(rawBody));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const meta = asRecord(payload.meta);
  const event = text(meta.event_name);
  const customUserId = text(asRecord(meta.custom_data).user_id);
  const data = asRecord(payload.data);
  const attributes = asRecord(data.attributes);

  if (event !== "order_created" && !isSubscriptionEvent(event)) {
    return Response.json({ ok: true, ignored: event });
  }

  const admin = createSupabaseAdminClient();

  try {
    if (isSubscriptionEvent(event)) {
      const subscriptionId = text(data.id);
      const userId = await resolveSubscriptionUser(admin, customUserId, subscriptionId);
      // Без владельца событие нельзя применить: отвечаем 200, чтобы Lemon не повторял.
      if (!userId) {
        console.warn("[lemonsqueezy] subscription event without user", event, subscriptionId);
        return Response.json({ ok: true, ignored: "no_user_id" });
      }
      await applySubscriptionEvent(admin, event, userId, subscriptionId, attributes);
      return Response.json({ ok: true });
    }

    // order_created
    if (!UUID_PATTERN.test(customUserId)) {
      console.warn("[lemonsqueezy] order without valid user_id", text(data.id));
      return Response.json({ ok: true, ignored: "no_user_id" });
    }
    if (text(attributes.status) !== "paid") {
      return Response.json({ ok: true, ignored: "not_paid" });
    }
    const totalCents = Number(attributes.total_usd ?? attributes.total);
    if (!Number.isFinite(totalCents) || totalCents <= 0) {
      return Response.json({ ok: true, ignored: "no_amount" });
    }
    const topup = isFlexOrder(attributes);
    const item = asRecord(attributes.first_order_item);
    const description = topup ? "Top-up" : `${text(item.product_name) || "Subscription"} Plan`;

    const { error } = await admin.rpc("billing_apply_order", {
      p_user_id: customUserId,
      p_order_id: text(data.id),
      p_kind: topup ? "topup" : "subscription",
      p_description: description,
      p_amount: totalCents / 100,
    });
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[lemonsqueezy] webhook failed", event, error);
    // 500 → Lemon Squeezy повторит доставку; заказы идемпотентны по lemon_order_id.
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
