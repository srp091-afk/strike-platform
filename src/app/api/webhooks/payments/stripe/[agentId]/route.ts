import { connection } from "next/server";

import { handlePaymentSucceeded, loadStripeWebhookSecret, verifyStripeSignature } from "@/lib/payments";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Stripe повторяет событие, пока не получит 2xx. Неверная подпись — 400. */
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  await connection();
  const { agentId } = await params;
  const raw = await request.text();
  if (!UUID_PATTERN.test(agentId)) return new Response("OK", { status: 200 });
  try {
    const secret = await loadStripeWebhookSecret(agentId);
    if (!secret) {
      console.error("[stripe webhook] webhook secret is empty", agentId);
      return new Response("OK", { status: 200 });
    }
    if (!verifyStripeSignature(raw, request.headers.get("stripe-signature"), secret)) {
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }
    const event = JSON.parse(raw) as { type?: string; data?: { object?: { payment_status?: string; amount_total?: number; metadata?: { payment_id?: string } } } };
    if (event.type === "checkout.session.completed") {
      const session = event.data?.object;
      const paid = !session?.payment_status || session.payment_status === "paid";
      const paymentId = session?.metadata?.payment_id ?? "";
      const amount = typeof session?.amount_total === "number" ? session.amount_total / 100 : null;
      if (paid && paymentId) await handlePaymentSucceeded(agentId, paymentId, amount);
    }
  } catch (error) {
    console.error("[stripe webhook]", error instanceof Error ? error.message : error);
  }
  return new Response("OK", { status: 200 });
}
