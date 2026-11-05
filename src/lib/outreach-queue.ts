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
  return site ? `${site.replace(/\/$/, "")}/api/outreach/worker` : null;
}

export function outreachQueueConfigured() {
  return Boolean(process.env.QSTASH_TOKEN && process.env.OUTREACH_WORKER_SECRET && workerUrl());
}

export async function enqueueLogs(
  logIds: string[],
  delays: { mode: "random" | "fixed"; minMinutes: number; maxMinutes: number; fixedMinutes: number },
): Promise<{ queued: number; error?: string }> {
  const token = process.env.QSTASH_TOKEN;
  const secret = process.env.OUTREACH_WORKER_SECRET;
  const url = workerUrl();
  if (!token || !secret || !url) {
    return { queued: 0, error: "Очередь не настроена (QSTASH_TOKEN, OUTREACH_WORKER_SECRET, OUTREACH_WORKER_URL)." };
  }

  const client = new Client({ token });
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
    if (elapsedSeconds > MAX_DELAY_SECONDS) break;
    try {
      await client.publishJSON({
        url,
        body: { logId },
        ...(elapsedSeconds > 0 ? { delay: elapsedSeconds } : {}),
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
