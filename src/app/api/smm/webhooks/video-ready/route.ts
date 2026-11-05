import { timingSafeEqual } from "node:crypto";
import { connection } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validSecret(request: Request) {
  const expected = process.env.WEBHOOK_SECRET?.trim();
  if (!expected) return false;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const received = request.headers.get("x-webhook-secret") ?? bearer ?? "";
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Вебхук видеодвижка: готовое видео прикрепляется к посту и попадает в smm_assets.
 * Без пользовательской сессии (вызывает сервер), защищён общим секретом WEBHOOK_SECRET
 * (заголовок `x-webhook-secret` или `Authorization: Bearer`).
 */
export async function POST(request: Request) {
  await connection();
  if (!process.env.WEBHOOK_SECRET?.trim()) return Response.json({ error: "WEBHOOK_SECRET is not set" }, { status: 503 });
  if (!validSecret(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { postId?: unknown; videoUrl?: unknown } | null;
  const postId = typeof body?.postId === "string" ? body.postId : "";
  const videoUrl = typeof body?.videoUrl === "string" ? body.videoUrl.trim() : "";
  if (!UUID.test(postId)) return Response.json({ error: "postId должен быть UUID" }, { status: 400 });
  let parsed: URL | null = null;
  try {
    parsed = new URL(videoUrl);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== "https:" || videoUrl.length > 1000) {
    return Response.json({ error: "videoUrl должен быть https-ссылкой" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: post, error } = await supabase.from("smm_posts").select("id, project_id, media_urls").eq("id", postId).maybeSingle();
  if (error) {
    console.error("[video-ready]", error.message);
    return Response.json({ error: "Ошибка базы данных" }, { status: 500 });
  }
  if (!post) return Response.json({ error: "Пост не найден" }, { status: 404 });

  // Повторная доставка вебхука не плодит дубли.
  const current = Array.isArray(post.media_urls) ? (post.media_urls as string[]) : [];
  if (current.includes(videoUrl)) return Response.json({ ok: true, duplicate: true });

  const { error: updateError } = await supabase.from("smm_posts").update({ media_urls: [...current, videoUrl] }).eq("id", post.id);
  if (updateError) {
    console.error("[video-ready] update", updateError.message);
    return Response.json({ error: "Не удалось обновить пост" }, { status: 500 });
  }
  const { error: assetError } = await supabase
    .from("smm_assets")
    .insert({ project_id: post.project_id, file_url: videoUrl, asset_type: "ai_generated" });
  if (assetError) console.error("[video-ready] asset", assetError.message);

  return Response.json({ ok: true });
}
