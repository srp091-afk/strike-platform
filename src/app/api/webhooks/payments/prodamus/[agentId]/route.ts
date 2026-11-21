import { connection } from "next/server";

import { handlePaymentSucceeded, loadProdamusSecret, verifyProdamusSignature } from "@/lib/payments";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Продамус присылает form-urlencoded и подпись в заголовке Sign. */
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  await connection();
  const { agentId } = await params;
  const raw = await request.text();
  if (!UUID_PATTERN.test(agentId)) return new Response("OK", { status: 200 });
  try {
    const form = new URLSearchParams(raw);
    const secret = await loadProdamusSecret(agentId);
    const sign = request.headers.get("sign");
    if (!secret || !verifyProdamusSignature(form, sign, secret)) {
      return Response.json({ error: "Invalid signature" }, { status: 400 });
    }
    const status = (form.get("payment_status") ?? "").toLowerCase();
    const orderId = form.get("order_id") ?? "";
    const sum = form.get("sum");
    if (status === "success" && orderId) {
      await handlePaymentSucceeded(agentId, orderId, sum ? Number(sum) : null);
    }
  } catch (error) {
    console.error("[prodamus webhook]", error instanceof Error ? error.message : error);
  }
  return new Response("OK", { status: 200 });
}
