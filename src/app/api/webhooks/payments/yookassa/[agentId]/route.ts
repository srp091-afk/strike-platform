import { connection } from "next/server";

import { confirmYookassaPayment, handlePaymentSucceeded } from "@/lib/payments";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ЮKassa ждёт 200. Статус платежа перепроверяется ключом агента, а не телом уведомления. */
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  await connection();
  const { agentId } = await params;
  if (!UUID_PATTERN.test(agentId)) return new Response("OK", { status: 200 });
  try {
    const body = (await request.json().catch(() => null)) as { event?: string; object?: { id?: string } } | null;
    if (body?.event === "payment.succeeded" && typeof body.object?.id === "string") {
      const confirmed = await confirmYookassaPayment(agentId, body.object.id);
      if (confirmed) await handlePaymentSucceeded(agentId, confirmed.paymentId, confirmed.amount);
    }
  } catch (error) {
    console.error("[yookassa webhook]", error instanceof Error ? error.message : error);
  }
  return new Response("OK", { status: 200 });
}
