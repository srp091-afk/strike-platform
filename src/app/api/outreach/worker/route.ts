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

  const authorized =
    (await validSignature(request.headers.get("upstash-signature"), body, process.env.OUTREACH_WORKER_URL?.trim() || request.url)) ||
    validSecret(request.headers.get("x-outreach-secret"));
  if (!authorized) return Response.json({ error: "Forbidden" }, { status: 403 });

  let logId: unknown;
  try {
    logId = (JSON.parse(body) as { logId?: unknown }).logId;
  } catch {
    logId = null;
  }
  if (typeof logId !== "string") return Response.json({ error: "logId required" }, { status: 400 });

  const result = await processOutreachLog(logId);
  // 429 заставляет QStash повторить задачу позже, когда суточный лимит обнулится.
  if (result.status === "skipped" && result.detail === "daily_limit") {
    return Response.json(result, { status: 429 });
  }
  return Response.json(result);
}
