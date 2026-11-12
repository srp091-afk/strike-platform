import { Receiver } from "@upstash/qstash";
import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";

import { processOutreachLog } from "@/lib/outreach-worker";

export const maxDuration = 120;

function validSecret(received: string | null) {
  const expected = process.env.OUTREACH_WORKER_SECRET;
  if (!expected || !received) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Подпись QStash (JWT в Upstash-Signature) проверяется по current/next ключам: так переживается ротация. */
async function validSignature(signature: string | null, body: string, url: string) {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!signature || !currentSigningKey || !nextSigningKey) return false;
  try {
    return await new Receiver({ currentSigningKey, nextSigningKey }).verify({ signature, body, url });
  } catch {
    return false;
  }
}

/**
 * Воркер очереди (QStash): одна задача = одна строка базы. Роут публичный (без сессии),
 * поэтому пускаем только запросы с валидной подписью QStash или с OUTREACH_WORKER_SECRET.
 */
export async function POST(request: Request) {
  await connection();
  const body = await request.text();

  const signature = request.headers.get("upstash-signature");
  const authorized =
    validSecret(request.headers.get("x-outreach-secret")) ||
    (await validSignature(signature, body, request.url)) ||
    (await validSignature(signature, body, process.env.OUTREACH_WORKER_URL?.trim() || request.url));
  if (!authorized) {
    console.error("[outreach-worker] 403: нет валидной подписи QStash или x-outreach-secret");
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let logId: unknown;
  let generation: number | undefined;
  try {
    const payload = JSON.parse(body) as { logId?: unknown; generation?: unknown };
    logId = payload.logId;
    generation = typeof payload.generation === "number" ? payload.generation : undefined;
  } catch {
    logId = null;
  }
  if (typeof logId !== "string") return Response.json({ error: "logId required" }, { status: 400 });

  const result = await processOutreachLog(logId, generation);
  console.log(`[outreach-worker] ${logId}: ${result.status}${result.detail ? ` (${result.detail})` : ""}`);
  // Если отложить задачу своим publish не удалось, QStash повторит текущую.
  if ((result.detail === "daily_limit" || result.detail === "outside_hours") && !result.rescheduled) {
    return Response.json(result, { status: 429, headers: { "Retry-After": "120" } });
  }
  return Response.json(result);
}
