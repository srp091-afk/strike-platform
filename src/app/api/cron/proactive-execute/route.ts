import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";
import type { NextRequest } from "next/server";

import { executeDueProactive } from "@/lib/proactive/execute";

export const maxDuration = 60;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const received = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Отправляет подошедшие проактивные задачи и, если у кампании задан schedule_cron,
 * запускает сбор плана. Hobby Vercel не принимает поминутный cron, поэтому
 * расписание в vercel.json не ставим: внешний cron бьёт сюда с Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  await connection();
  if (!process.env.CRON_SECRET?.trim()) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const summary = await executeDueProactive({ plan: true });
    return Response.json(summary);
  } catch (error) {
    console.error("[cron proactive]", error instanceof Error ? error.message : error);
    return Response.json({ ok: false, error: "Proactive run failed" }, { status: 500 });
  }
}
