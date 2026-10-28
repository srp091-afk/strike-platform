import type { NextRequest } from "next/server";

import { runFollowups } from "@/lib/followup";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 300;
/**
 * Почасовой планировщик умных напоминаний (Vercel Cron, см. vercel.json).
 * Vercel сам шлёт `Authorization: Bearer $CRON_SECRET`; без секрета эндпоинт закрыт.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runFollowups(createSupabaseAdminClient());
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    console.error("[cron followups]", error instanceof Error ? error.message : error);
    return Response.json({ ok: false, error: "Follow-up run failed" }, { status: 500 });
  }
}
