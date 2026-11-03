import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import { DEMO_TOKEN_HEADER, DEMO_TOKEN_TTL_MS, demoTokenPayload } from "@/lib/demo-token";

function hostOfUrl(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Хосты, с которых разрешены запросы: сам сервер плюс (опционально) NEXT_PUBLIC_SITE_URL и DEMO_ALLOWED_ORIGINS. */
function allowedHosts(request: NextRequest) {
  const hosts = new Set<string>();
  const own = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))?.split(",")[0]?.trim();
  if (own) hosts.add(own.toLowerCase());
  const extra = [process.env.NEXT_PUBLIC_SITE_URL, ...(process.env.DEMO_ALLOWED_ORIGINS?.split(",") ?? [])];
  for (const item of extra) {
    const host = hostOfUrl(item?.trim() ?? null);
    if (host) hosts.add(host);
  }
  return hosts;
}

function forbidden(message: string) {
  return Response.json({ error: message }, { status: 403 });
}

/**
 * Невидимая защита публичных демо-эндпоинтов (без капч): строгая проверка Origin/Referer и подписанный
 * временной токен. Возвращает готовый ответ 403, если запрос не прошёл, иначе null.
 * CORS-заголовков (Access-Control-Allow-*) мы не отдаём, поэтому чужие сайты не прочитают ответ из браузера.
 */
export function guardDemoRequest(request: NextRequest): Response | null {
  const hosts = allowedHosts(request);

  // У браузерных POST-запросов Origin есть всегда; Referer — запасной вариант. Нет обоих — не наш клиент.
  const origin = request.headers.get("origin");
  const source = origin ?? request.headers.get("referer");
  const sourceHost = hostOfUrl(source);
  if (!sourceHost || !hosts.has(sourceHost)) return forbidden("Запрос отклонён.");

  const token = request.headers.get(DEMO_TOKEN_HEADER) ?? "";
  const [stamp, signature] = token.split(".");
  const timestamp = Number(stamp);
  if (!stamp || !signature || !Number.isFinite(timestamp)) return forbidden("Запрос отклонён.");
  if (Math.abs(Date.now() - timestamp) > DEMO_TOKEN_TTL_MS) return forbidden("Сессия устарела. Обновите страницу.");

  const expected = createHash("sha256").update(demoTokenPayload(timestamp, request.nextUrl.pathname)).digest("hex");
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return forbidden("Запрос отклонён.");

  return null;
}
