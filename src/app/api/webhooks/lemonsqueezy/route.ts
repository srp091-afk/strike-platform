import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAN_NAMES = ["starter", "pro", "agency"] as const;

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
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

/** Пополнение Flex: по ID варианта (если задан) либо по названию продукта. */
function isFlexOrder(attributes: Json) {
  const item = asRecord(attributes.first_order_item);
  const flexVariant = process.env.LEMONSQUEEZY_FLEX_VARIANT_ID;
  if (flexVariant && text(item.variant_id) === flexVariant) return true;
  return `${text(item.product_name)} ${text(item.variant_name)}`.toLowerCase().includes("flex");
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
  const userId = text(asRecord(meta.custom_data).user_id);
  const data = asRecord(payload.data);
  const attributes = asRecord(data.attributes);

  if (event !== "subscription_created" && event !== "order_created") {
    return Response.json({ ok: true, ignored: event });
  }
  // Без user_id платёж нельзя привязать к аккаунту: отвечаем 200, чтобы Lemon не повторял.
  if (!UUID_PATTERN.test(userId)) {
    console.warn("[lemonsqueezy] event without valid user_id", event, text(data.id));
    return Response.json({ ok: true, ignored: "no_user_id" });
  }

  const admin = createSupabaseAdminClient();

  try {
    if (event === "subscription_created") {
      const plan = planFrom(attributes);
      const { error } = await admin.from("profiles").upsert(
        {
          id: userId,
          ...(plan ? { plan } : {}),
          subscription_status: text(attributes.status) || "active",
          lemon_subscription_id: text(data.id),
          lemon_customer_id: text(attributes.customer_id),
          plan_renews_at: text(attributes.renews_at) || null,
        },
        { onConflict: "id" },
      );
      if (error) throw new Error(error.message);
      return Response.json({ ok: true });
    }

    // order_created
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
      p_user_id: userId,
      p_order_id: text(data.id),
      p_kind: topup ? "topup" : "subscription",
      p_description: description,
      p_amount: totalCents / 100,
    });
    if (error) throw new Error(error.message);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[lemonsqueezy] webhook failed", event, error);
    // 500 → Lemon Squeezy повторит доставку; заказ идемпотентен по lemon_order_id.
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
