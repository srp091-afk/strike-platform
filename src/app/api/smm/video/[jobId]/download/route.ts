import { connection } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { VIDEO_JOB_ID_PATTERN } from "@/lib/video-types";

/** Прокси скачивания: токен видеодвижка остаётся на сервере, браузер получает только готовый файл. */
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  await connection();
  try {
    await getAuthenticatedUserId();
  } catch {
    return Response.json({ error: "Нужно войти в аккаунт." }, { status: 401 });
  }

  const { jobId } = await params;
  if (!VIDEO_JOB_ID_PATTERN.test(jobId)) return Response.json({ error: "Некорректная задача." }, { status: 400 });

  const url = process.env.VIDEO_ENGINE_URL?.trim().replace(/\/$/, "");
  const key = process.env.VIDEO_ENGINE_API_KEY?.trim();
  if (!url || !key) return Response.json({ error: "Видеодвижок не настроен." }, { status: 500 });

  let upstream: Response;
  try {
    upstream = await fetch(`${url}/api/v1/download/${jobId}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return Response.json({ error: "Видеодвижок недоступен." }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return Response.json({ error: "Файл не готов или уже скачан." }, { status: upstream.status === 404 ? 404 : 502 });
  }

  const headers = new Headers({
    "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
    "Content-Disposition": `attachment; filename="strike-reels-${jobId.slice(0, 8)}.mp4"`,
    "Cache-Control": "no-store",
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);
  return new Response(upstream.body, { headers });
}
