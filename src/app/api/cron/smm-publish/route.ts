import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { connection } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

const BATCH_LIMIT = 100;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const received = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Автопубликация: посты со статусом ready и наступившим scheduled_time переводятся в published.
 * Реальной отправки в соцсети пока нет (нет OAuth) — вместо неё лог-заглушка.
 * Vercel Cron сам шлёт `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  await connection();
  if (!process.env.CRON_SECRET?.trim()) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createSupabaseAdminClient();
  const { data: due, error } = await supabase
    .from("smm_posts")
    .select("id, target_channels")
    .eq("status", "ready")
    .lte("scheduled_time", new Date().toISOString())
    .order("scheduled_time", { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) {
    console.error("[cron smm-publish]", error.message);
    return Response.json({ ok: false, error: "Ошибка базы данных" }, { status: 500 });
  }

  let published = 0;
  for (const post of due ?? []) {
    // Условное обновление: параллельный запуск крона не опубликует один пост дважды.
    const { data: claimed, error: updateError } = await supabase
      .from("smm_posts")
      .update({ status: "published" })
      .eq("id", post.id)
      .eq("status", "ready")
      .select("id");
    if (updateError) {
      console.error("[cron smm-publish] update", post.id, updateError.message);
      continue;
    }
    if (!claimed?.length) continue;
    console.log("Publishing post", post.id, "to channels:", post.target_channels);
    published += 1;
  }

  return Response.json({ ok: true, found: due?.length ?? 0, published });
}
