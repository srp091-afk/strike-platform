import "server-only";

import { Client } from "@upstash/qstash";

/**
 * Фоновые задачи рассылки. Каждая строка базы = отдельное сообщение QStash -> POST OUTREACH_WORKER_URL.
 * Задержка между отправками считается заранее: к накопленной задержке добавляется случайное значение
 * в [min, max] минут, и передаётся в QStash как delay. Поэтому API-роуты не держат соединение
 * и не упираются в таймауты. Воркер (processOutreachLog) от транспорта не зависит: для BullMQ
 * достаточно заменить enqueueLogs.
 *
 * Env: QSTASH_TOKEN, OUTREACH_WORKER_URL, OUTREACH_WORKER_SECRET (+ QSTASH_*_SIGNING_KEY для проверки подписи).
 */

/** Максимальная отложенная доставка QStash на бесплатном плане: 7 дней. */
const MAX_DELAY_SECONDS = 7 * 24 * 60 * 60;

function workerUrl() {
  const explicit = process.env.OUTREACH_WORKER_URL?.trim();
  if (explicit) return explicit;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  return site ? `${site.replace(/\/$/, "")}/api/leads/worker` : null;
}

/** QStash не следует редиректам (apex -> www дают 308): заранее находим конечный адрес воркера. */
async function resolveFinalUrl(start: string): Promise<string> {
  let current = start;
  for (let hop = 0; hop < 3; hop += 1) {
    try {
      const response = await fetch(current, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(5000) });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) current = new URL(location, current).toString();
      else break;
    } catch {
      break;
    }
  }
  return current;
}

export function outreachQueueConfigured() {
  return Boolean(process.env.QSTASH_TOKEN && process.env.OUTREACH_WORKER_SECRET && workerUrl());
}

async function publisher() {
  const token = process.env.QSTASH_TOKEN;
  const secret = process.env.OUTREACH_WORKER_SECRET;
  const configuredUrl = workerUrl();
  const url = configuredUrl ? await resolveFinalUrl(configuredUrl) : null;
  if (!token || !secret || !url) {
    return { error: "Очередь не настроена (QSTASH_TOKEN, OUTREACH_WORKER_SECRET, OUTREACH_WORKER_URL)." as const };
  }
  return { client: new Client({ token }), url, secret };
}

export async function enqueueLogs(
  logIds: string[],
  delays: { mode: "random" | "fixed"; minMinutes: number; maxMinutes: number; fixedMinutes: number },
  options?: { notBeforeSeconds?: number },
): Promise<{ queued: number; error?: string }> {
  const published = await publisher();
  if ("error" in published) return { queued: 0, error: published.error };
  const { client, url, secret } = published;
  const notBefore = Math.max(0, Math.round(options?.notBeforeSeconds ?? 0));

  let elapsedSeconds = 0;
  let queued = 0;
  for (const logId of logIds) {
    // «Фиксированная» пауза — ровно N минут между отправками; «случайная» — значение из [min, max].
    const gapMinutes =
      delays.mode === "fixed"
        ? delays.fixedMinutes
        : delays.minMinutes + Math.random() * Math.max(0, delays.maxMinutes - delays.minMinutes);
    // Первое сообщение уходит сразу, пауза отсчитывается только между сообщениями.
    if (queued > 0) elapsedSeconds += Math.max(1, Math.round(gapMinutes * 60));
    const delay = elapsedSeconds + notBefore;
    if (delay > MAX_DELAY_SECONDS) break;
    try {
      await client.publishJSON({
        url,
        body: { logId },
        ...(delay > 0 ? { delay } : {}),
        retries: 2,
        // Дублирующая защита: воркер принимает либо подпись QStash, либо этот секрет.
        headers: { "x-outreach-secret": secret },
      });
      queued += 1;
    } catch (error) {
      return { queued, error: `QStash: ${error instanceof Error ? error.message : "ошибка публикации"}` };
    }
  }
  return { queued };
}

/** Публикует уже посчитанные задержки. delaySeconds — секунды от текущего момента. */
export async function enqueueAt(
  items: Array<{ logId: string; delaySeconds: number }>,
  options?: { generation?: number },
): Promise<{ queued: number; error?: string }> {
  if (items.length === 0) return { queued: 0 };
  const published = await publisher();
  if ("error" in published) return { queued: 0, error: published.error };
  const { client, url, secret } = published;
  let queued = 0;
  for (const item of items) {
    const delay = Math.min(MAX_DELAY_SECONDS, Math.max(0, Math.round(item.delaySeconds)));
    try {
      await client.publishJSON({
        url,
        body: {
          logId: item.logId,
          ...(typeof options?.generation === "number" ? { generation: options.generation } : {}),
        },
        ...(delay > 0 ? { delay } : {}),
        retries: 3,
        headers: { "x-outreach-secret": secret },
      });
      queued += 1;
    } catch (error) {
      return { queued, error: `QStash: ${error instanceof Error ? error.message : "ошибка публикации"}` };
    }
  }
  return { queued };
}
