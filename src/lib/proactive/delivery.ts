import { isWithinWorkWindow, nextWindowStart, normalizeSchedule, zonedDateKey, type WorkSchedule } from "@/lib/outreach-schedule";

export type ProactiveChannel = "whatsapp" | "telegram" | "email";
export type DeliveryMode = "interval" | "batch";

export type DeliveryConfig = {
  mode: DeliveryMode;
  min_delay_sec: number;
  max_delay_sec: number;
  batch_size: number;
  batch_delay_sec: number;
  daily_limit: number;
  work_hours_only: boolean;
  work_hours_start: string;
  work_hours_end: string;
};

export function defaultDelivery(channel: ProactiveChannel): DeliveryConfig {
  if (channel === "email") {
    return {
      mode: "batch",
      min_delay_sec: 0,
      max_delay_sec: 0,
      batch_size: 50,
      batch_delay_sec: 60,
      daily_limit: 1000,
      work_hours_only: false,
      work_hours_start: "09:00",
      work_hours_end: "20:00",
    };
  }
  return {
    mode: "interval",
    min_delay_sec: 45,
    max_delay_sec: 120,
    batch_size: 1,
    batch_delay_sec: 60,
    daily_limit: 50,
    work_hours_only: true,
    work_hours_start: "09:00",
    work_hours_end: "20:00",
  };
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function readDelivery(value: unknown, channel: ProactiveChannel): DeliveryConfig {
  const base = defaultDelivery(channel);
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const mode = record.mode === "batch" || record.mode === "interval" ? record.mode : base.mode;
  const minDelay = clamp(Number(record.min_delay_sec), 0, 86_400, base.min_delay_sec);
  const maxDelay = clamp(Number(record.max_delay_sec), 0, 86_400, base.max_delay_sec);
  const start = typeof record.work_hours_start === "string" && /^\d{2}:\d{2}$/.test(record.work_hours_start) ? record.work_hours_start : base.work_hours_start;
  const end = typeof record.work_hours_end === "string" && /^\d{2}:\d{2}$/.test(record.work_hours_end) ? record.work_hours_end : base.work_hours_end;
  return {
    mode,
    min_delay_sec: Math.min(minDelay, maxDelay),
    max_delay_sec: Math.max(minDelay, maxDelay),
    batch_size: clamp(Number(record.batch_size), 1, 500, base.batch_size),
    batch_delay_sec: clamp(Number(record.batch_delay_sec), 0, 86_400, base.batch_delay_sec),
    daily_limit: clamp(Number(record.daily_limit), 1, 5000, base.daily_limit),
    work_hours_only: typeof record.work_hours_only === "boolean" ? record.work_hours_only : base.work_hours_only,
    work_hours_start: start,
    work_hours_end: end,
  };
}

function scheduleOf(config: DeliveryConfig, timezone: string): WorkSchedule {
  if (!config.work_hours_only) return normalizeSchedule({ workTimeStart: "00:00", workTimeEnd: "23:59", timezone });
  return normalizeSchedule({ workTimeStart: config.work_hours_start, workTimeEnd: config.work_hours_end, timezone });
}

function snap(slot: Date, schedule: WorkSchedule, sent: number, limit: number) {
  const limitReached = sent >= limit;
  if (!limitReached && isWithinWorkWindow(slot, schedule)) return slot;
  return nextWindowStart(slot, schedule, limitReached);
}

/** Времена отправки для пачки одобренных карточек. Курсор — последнее уже занятое время этого канала. */
export function planSlots(input: {
  count: number;
  config: DeliveryConfig;
  timezone: string;
  now: Date;
  cursor: Date;
  sentToday: number;
  random?: () => number;
}) {
  const schedule = scheduleOf(input.config, input.timezone);
  const random = input.random ?? Math.random;
  const limit = input.config.daily_limit;
  const slots: Date[] = [];
  let cursor = input.cursor.getTime() > input.now.getTime() ? input.cursor : input.now;
  let day = zonedDateKey(cursor, schedule.timezone);
  let sent = zonedDateKey(input.now, schedule.timezone) === day ? Math.max(0, input.sentToday) : 0;

  if (input.config.mode === "batch") {
    const startAt = input.cursor.getTime() > input.now.getTime() ? new Date(input.cursor.getTime() + input.config.batch_delay_sec * 1000) : input.now;
    let batchStart = snap(startAt, schedule, sent, limit);
    let batchDay = zonedDateKey(batchStart, schedule.timezone);
    let batchSent = batchDay === zonedDateKey(input.now, schedule.timezone) ? sent : 0;
    for (let index = 0; index < input.count; index += 1) {
      if (index > 0 && index % input.config.batch_size === 0) {
        batchStart = snap(new Date(batchStart.getTime() + input.config.batch_delay_sec * 1000), schedule, batchSent, limit);
        const nextDay = zonedDateKey(batchStart, schedule.timezone);
        if (nextDay !== batchDay) {
          batchDay = nextDay;
          batchSent = 0;
          batchStart = snap(batchStart, schedule, 0, limit);
        }
      }
      if (batchSent >= limit) {
        batchStart = snap(batchStart, schedule, batchSent, limit);
        batchDay = zonedDateKey(batchStart, schedule.timezone);
        batchSent = 0;
      }
      slots.push(batchStart);
      batchSent += 1;
    }
    return slots;
  }

  for (let index = 0; index < input.count; index += 1) {
    const currentDay = zonedDateKey(cursor, schedule.timezone);
    if (currentDay !== day) {
      day = currentDay;
      sent = 0;
    }
    const span = Math.max(0, input.config.max_delay_sec - input.config.min_delay_sec);
    const delaySec = input.config.min_delay_sec + Math.round(random() * span);
    let slot = new Date(cursor.getTime() + Math.max(1, delaySec) * 1000);
    const slotDay = zonedDateKey(slot, schedule.timezone);
    const sentForSlot = slotDay === day ? sent : 0;
    slot = snap(slot, schedule, sentForSlot, limit);
    const landed = zonedDateKey(slot, schedule.timezone);
    if (landed !== day) sent = 0;
    if (sent >= limit) {
      slot = snap(slot, schedule, sent, limit);
      sent = 0;
    }
    day = zonedDateKey(slot, schedule.timezone);
    slots.push(slot);
    sent += 1;
    cursor = slot;
  }
  return slots;
}

/** Пять полей cron: звезда или число. Без шагов и диапазонов, чтобы не запустить генерацию случайно. */
export function cronMatches(expression: string | null, now: Date) {
  if (!expression?.trim()) return false;
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const values = [now.getUTCMinutes(), now.getUTCHours(), now.getUTCDate(), now.getUTCMonth() + 1, now.getUTCDay()];
  return parts.every((part, index) => part === "*" || part.split(",").includes(String(values[index])));
}
