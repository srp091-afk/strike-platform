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

/** Воркер очереди (QStash): одна задача = одна строка базы. Без сессии, защищён OUTREACH_WORKER_SECRET. */
export async function POST(request: Request) {
  await connection();
  if (!validSecret(request.headers.get("x-outreach-secret"))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { logId?: unknown } | null;
  if (typeof body?.logId !== "string") return Response.json({ error: "logId required" }, { status: 400 });

  const result = await processOutreachLog(body.logId);
  // 429 заставляет QStash повторить задачу позже, когда суточный лимит обнулится.
  if (result.status === "skipped" && result.detail === "daily_limit") {
    return Response.json(result, { status: 429 });
  }
  return Response.json(result);
}
