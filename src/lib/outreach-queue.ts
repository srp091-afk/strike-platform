import "server-only";

/**
 * Фоновые задачи рассылки. Каждая строка базы = отдельная задача QStash -> POST /api/outreach/worker.
 * Задержка между отправками считается заранее (случайно в [min, max] минут) и передаётся как Upstash-Delay,
 * поэтому обычные API-роуты не держат соединение и не упираются в таймауты.
 *
 * Нужные env: QSTASH_TOKEN, OUTREACH_WORKER_SECRET, публичный URL сайта (OUTREACH_WORKER_URL или NEXT_PUBLIC_SITE_URL).
 * Для BullMQ достаточно заменить enqueueLogs: воркер (processOutreachLog) от транспорта не зависит.
 */

export function outreachQueueConfigured() {
  return Boolean(process.env.QSTASH_TOKEN && process.env.OUTREACH_WORKER_SECRET && workerUrl());
}

function workerUrl() {
  const explicit = process.env.OUTREACH_WORKER_URL;
  if (explicit) return explicit;
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return site ? `${site.replace(/\/$/, "")}/api/outreach/worker` : null;
}

export async function enqueueLogs(
  logIds: string[],
  delays: { minMinutes: number; maxMinutes: number },
): Promise<{ queued: number; error?: string }> {
  const token = process.env.QSTASH_TOKEN;
  const secret = process.env.OUTREACH_WORKER_SECRET;
  const target = workerUrl();
  if (!token || !secret || !target) return { queued: 0, error: "Очередь не настроена (QSTASH_TOKEN, OUTREACH_WORKER_SECRET, OUTREACH_WORKER_URL)." };

  let elapsedSeconds = 0;
  let queued = 0;
  for (const logId of logIds) {
    const gap = delays.minMinutes + Math.random() * Math.max(0, delays.maxMinutes - delays.minMinutes);
    elapsedSeconds += Math.round(gap * 60);
    const response = await fetch(`https://qstash.upstash.io/v2/publish/${target}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Upstash-Delay": `${elapsedSeconds}s`,
        "Upstash-Forward-x-outreach-secret": secret,
        "Upstash-Retries": "2",
      },
      body: JSON.stringify({ logId }),
    });
    if (!response.ok) return { queued, error: `QStash: ${response.status}` };
    queued += 1;
  }
  return { queued };
}
