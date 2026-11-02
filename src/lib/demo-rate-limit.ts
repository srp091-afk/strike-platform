import "server-only";

import type { NextRequest } from "next/server";

/**
 * Публичные демо-эндпоинты тратят наши токены, поэтому режем частоту запросов по IP.
 * Счётчик живёт в памяти инстанса: это сдерживает случайный перебор, но не гарантирует защиту от целенаправленной атаки.
 */
const WINDOW_MS = 10 * 60 * 1000;
const buckets = new Map<string, number[]>();

export function clientIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** true — лимит превышен. `scope` разделяет счётчики эндпоинтов, `max` — запросов за 10 минут. */
export function isRateLimited(scope: string, ip: string, max: number) {
  const now = Date.now();
  const key = `${scope}:${ip}`;
  const recent = (buckets.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  recent.push(now);
  buckets.set(key, recent);

  if (buckets.size > 5000) {
    for (const [bucketKey, times] of buckets) {
      if (times.every((time) => now - time >= WINDOW_MS)) buckets.delete(bucketKey);
    }
  }
  return recent.length > max;
}
