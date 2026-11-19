import { createHmac, timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

import { creditPackByPriceId, planByPriceId, purchaseLabel, type PaddlePlan } from "@/lib/paddle-catalog";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Paddle подписывает каждый повтор заново. Окно шире 5 секунд SDK, чтобы холодный старт не отклонял живой вебхук. */
const MAX_SIGNATURE_AGE_SECONDS = 300;

type Json = Record<string, unknown>;

function asRecord(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function signaturesMatch(expectedHex: string, receivedHex: string) {
  const expected = Buffer.from(expectedHex, "utf8");
  const received = Buffer.from(receivedHex, "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** Paddle-Signature: `ts=unix;h1=hex`. Подпись считается от строки `${ts}:${rawBody}`. */
export function validPaddleSignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  let timestamp = "";
  const hashes: string[] = [];
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === "ts") timestamp = value;
    if (key === "h1" && value) hashes.push(value);
  }
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || hashes.length === 0) return false;
  const age = Math.floor(Date.now() / 1000) - ts;
  if (age > MAX_SIGNATURE_AGE_SECONDS || age < -60) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}:${rawBody}`).digest("hex");
  return hashes.some((hash) => signaturesMatch(expected, hash.toLowerCase()));
}

function priceIds(data: Json) {
  const items = Array.isArray(data.items) ? data.items : [];
  return items
    .map((item) => {
      const record = asRecord(item);
      return text(asRecord(record.price).id) || text(record.price_id);
    })
    .filter(Boolean);
}

function userIdFrom(data: Json) {
  const custom = asRecord(data.custom_data);
  return text(custom.userId) || text(custom.user_id);
}

async function recordPayment(
  userId: string,
  orderId: string,
  credits: number,
  description: string,
  amount: number,
  currency: string,
  method: string,
  kind: "topup" | "subscription",
) {
  const admin = createSupabaseAdminClient();
  const args = {
    p_user_id: userId,
    p_order_id: orderId,
    p_kind: kind,
    p_description: description,
    p_amount: amount,
    p_method: method,
    p_currency: currency,
  };
  const full = await admin.rpc("billing_apply_order", args);
  if (full.error && /billing_apply_order|schema cache|p_method|p_currency/i.test(full.error.message)) {
    const basic = await admin.rpc("billing_apply_order", {
      p_user_id: userId,
      p_order_id: orderId,
      p_kind: kind,
      p_description: description,
      p_amount: amount,
    });
    if (basic.error) throw new Error(basic.error.message);
    await admin.from("billing_transactions").update({ method }).eq("lemon_order_id", orderId);
  } else if (full.error) {
    throw new Error(full.error.message);
  }
  if (credits <= 0) return;
  const { error: grantError } = await admin.rpc("grant_strike_credits", {
    p_user_id: userId,
    p_order_id: orderId,
    p_credits: credits,
  });
  if (grantError) throw new Error(grantError.message);
}

function money(raw: string) {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return 0;
  const amount = raw.includes(".") ? numeric : numeric / 100;
  return Math.round(amount * 100) / 100;
}

/** Фактически списанная сумма. Промокод на 100% даёт 0, кредиты при этом всё равно начисляются. */
function chargedAmount(data: Json) {
  const totals = asRecord(asRecord(data.details).totals);
  const currency = text(data.currency_code) || text(totals.currency_code) || "USD";
  const raw = text(totals.grand_total) || text(totals.total) || "0";
  return { amount: money(raw), currency };
}

function paymentMethod(data: Json, amount: number) {
  if (amount === 0) return "Promo";
  const payments = Array.isArray(data.payments) ? data.payments : [];
  const details = asRecord(asRecord(payments[0]).method_details);
  const type = text(details.type) || text(asRecord(payments[0]).payment_method_type);
  const labels: Record<string, string> = {
    card: "Card",
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
    paypal: "PayPal",
  };
  return labels[type] ?? (type ? type : "Card");
}

function paddleId(value: unknown, prefix: string) {
  const id = text(value);
  return id.startsWith(prefix) ? id : "";
}

/** Сохраняет покупателя и подписку Paddle. Пустое поле не затирает уже записанный id. */
async function savePaddleIdentity(userId: string, data: Json, event: string) {
  const customerId = paddleId(data.customer_id, "ctm_") || paddleId(asRecord(data.customer).id, "ctm_");
  const subscriptionId = event === "subscription.created" ? paddleId(data.id, "sub_") : paddleId(data.subscription_id, "sub_");
  const patch: Record<string, string> = {};
  if (customerId) patch.paddle_customer_id = customerId;
  if (subscriptionId) patch.paddle_subscription_id = subscriptionId;
  if (Object.keys(patch).length === 0) return;

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (!error) return;
  if (/paddle_customer_id|paddle_subscription_id/.test(error.message)) {
    console.error("[paddle] apply migration 20261119_paddle_customer.sql");
    return;
  }
  throw new Error(error.message);
}

async function applyPlan(userId: string, plan: PaddlePlan) {
  const admin = createSupabaseAdminClient();
  const patch = { ...plan.patch, subscription_status: "active" };
  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (!error) return;
  if (!("tier_ads" in patch) || !error.message.toLowerCase().includes("tier_ads")) throw new Error(error.message);
  const withoutAds = { ...patch };
  delete withoutAds.tier_ads;
  const retry = await admin.from("profiles").update(withoutAds).eq("id", userId);
  if (retry.error) throw new Error(retry.error.message);
}

export async function POST(request: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[paddle] PADDLE_WEBHOOK_SECRET is not set");
    return Response.json({ error: "Webhook is not configured" }, { status: 500 });
  }

  const rawBody = await request.text();
  if (!validPaddleSignature(rawBody, request.headers.get("paddle-signature"), secret)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: Json;
  try {
    payload = asRecord(JSON.parse(rawBody));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = text(payload.event_type);
  const data = asRecord(payload.data);
  if (event !== "transaction.completed" && event !== "subscription.created") {
    return Response.json({ ok: true, ignored: event });
  }

  const userId = userIdFrom(data);
  const orderId = text(data.id);
  if (!UUID_PATTERN.test(userId) || !orderId) {
    console.warn("[paddle] event without user or id", event);
    return Response.json({ ok: true, ignored: "no_user_id" });
  }

  try {
    await savePaddleIdentity(userId, data, event);
    const ids = priceIds(data);
    if (event === "transaction.completed") {
      const { amount, currency } = chargedAmount(data);
      const method = paymentMethod(data, amount);
      const labels: string[] = [];
      let credits = 0;
      let sawPack = false;
      let sawPlan = false;
      for (const priceId of ids) {
        const label = purchaseLabel(priceId);
        const pack = creditPackByPriceId(priceId);
        if (pack) {
          sawPack = true;
          labels.push(label ?? "STRIKE Credits");
          credits += pack.credits;
          continue;
        }
        const plan = planByPriceId(priceId);
        if (plan) {
          sawPlan = true;
          labels.push(label ?? "STRIKE");
          credits += plan.credits;
        }
      }
      if (labels.length > 0) {
        await recordPayment(
          userId,
          orderId,
          credits,
          labels.join(", "),
          amount,
          currency,
          method,
          sawPack && !sawPlan ? "topup" : "subscription",
        );
      }
      return Response.json({ ok: true });
    }

    for (const priceId of ids) {
      const plan = planByPriceId(priceId);
      if (plan) await applyPlan(userId, plan);
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[paddle] webhook failed", event, error);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
