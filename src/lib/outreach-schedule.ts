/** Чистое расписание кампании: без серверных импортов, одинаково для бейджа и воркера. */

export type WorkSchedule = {
  workTimeStart: string;
  workTimeEnd: string;
  timezone: string;
};

export type SendDelaySettings = {
  mode: "random" | "fixed";
  minMinutes: number;
  maxMinutes: number;
  fixedMinutes: number;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function readWorkTime(value: unknown, fallback: string) {
  return typeof value === "string" && TIME_PATTERN.test(value) ? value : fallback;
}

export function readTimeZone(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "UTC";
  const zone = value.trim();
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return "UTC";
  }
}

/** Пустые значения не сужают уже идущие кампании: окно на весь день в UTC. */
export function normalizeSchedule(input: {
  workTimeStart?: unknown;
  workTimeEnd?: unknown;
  timezone?: unknown;
}): WorkSchedule {
  const start = readWorkTime(input.workTimeStart, "00:00");
  const end = readWorkTime(input.workTimeEnd, "23:59");
  if (start >= end) return { workTimeStart: "00:00", workTimeEnd: "23:59", timezone: readTimeZone(input.timezone) };
  return { workTimeStart: start, workTimeEnd: end, timezone: readTimeZone(input.timezone) };
}

export function browserTimeZone() {
  try {
    return readTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return "UTC";
  }
}

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(date)) bag[part.type] = part.value;
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

function offsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - date.getTime();
}

export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  let utc = guess - offsetMs(new Date(guess), timeZone);
  utc = guess - offsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

export function zonedDateKey(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function parseMinutes(value: string) {
  const [hour, minute] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

export function isWithinWorkWindow(now: Date, schedule: WorkSchedule) {
  const parts = zonedParts(now, schedule.timezone);
  const minutes = parts.hour * 60 + parts.minute;
  return minutes >= parseMinutes(schedule.workTimeStart) && minutes <= parseMinutes(schedule.workTimeEnd);
}

/** Полночь текущих суток в часовом поясе кампании. */
export function zonedDayStart(now: Date, timeZone: string) {
  const parts = zonedParts(now, timeZone);
  return zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, timeZone);
}

function addLocalDays(year: number, month: number, day: number, days: number, timeZone: string) {
  const noon = zonedTimeToUtc(year, month, day, 12, 0, timeZone);
  return zonedParts(new Date(noon.getTime() + days * 24 * 60 * 60 * 1000), timeZone);
}

/** Ближайшее начало окна. Если лимит на сегодня выбран, начало переносится на следующие сутки. */
export function nextWindowStart(now: Date, schedule: WorkSchedule, limitReached: boolean) {
  const parts = zonedParts(now, schedule.timezone);
  const [startHour, startMinute] = schedule.workTimeStart.split(":").map(Number);
  const minutes = parts.hour * 60 + parts.minute;
  const startToday = zonedTimeToUtc(parts.year, parts.month, parts.day, startHour, startMinute, schedule.timezone);
  if (!limitReached && minutes < parseMinutes(schedule.workTimeStart)) return startToday;
  if (!limitReached && isWithinWorkWindow(now, schedule)) return now;
  const next = addLocalDays(parts.year, parts.month, parts.day, 1, schedule.timezone);
  return zonedTimeToUtc(next.year, next.month, next.day, startHour, startMinute, schedule.timezone);
}

function gapMs(delay: SendDelaySettings, random: () => number) {
  const minutes =
    delay.mode === "fixed"
      ? delay.fixedMinutes
      : delay.minMinutes + random() * Math.max(0, delay.maxMinutes - delay.minMinutes);
  return Math.max(1000, Math.round((Number.isFinite(minutes) ? minutes : 1) * 60) * 1000);
}

/**
 * Задержки (секунды от `now`) для следующих сообщений.
 * В одни сутки не больше dailyLimit, и каждое попадает в окно работы.
 */
export function planSendDelays(input: {
  count: number;
  sentToday: number;
  dailyLimit: number;
  delay: SendDelaySettings;
  schedule: WorkSchedule;
  now?: Date;
  maxDelaySeconds?: number;
  random?: () => number;
}) {
  const now = input.now ?? new Date();
  const schedule = normalizeSchedule(input.schedule);
  const maxDelay = input.maxDelaySeconds ?? 7 * 24 * 60 * 60;
  const limit = Math.max(1, Math.round(input.dailyLimit) || 1);
  const random = input.random ?? Math.random;
  let dayKey = zonedDateKey(now, schedule.timezone);
  let sentOnDay = Math.max(0, input.sentToday);
  let cursor = now;
  const delays: number[] = [];

  for (let index = 0; index < input.count; index += 1) {
    const cursorDay = zonedDateKey(cursor, schedule.timezone);
    if (cursorDay !== dayKey) {
      dayKey = cursorDay;
      sentOnDay = 0;
    }
    const limitReached = sentOnDay >= limit;
    const inside = !limitReached && isWithinWorkWindow(cursor, schedule);
    const slot = inside ? cursor : nextWindowStart(cursor, schedule, limitReached);
    const slotDay = zonedDateKey(slot, schedule.timezone);
    const delaySeconds = Math.max(0, Math.round((slot.getTime() - now.getTime()) / 1000));
    if (delaySeconds > maxDelay) break;
    delays.push(delaySeconds);
    dayKey = slotDay;
    sentOnDay = slotDay === cursorDay && !limitReached ? sentOnDay + 1 : 1;
    cursor = new Date(slot.getTime() + gapMs(input.delay, random));
  }
  return delays;
}

export type CampaignHold = "daily_limit" | "outside_hours";

/** Бейдж поверх статуса active. На паузу, черновик и завершение не влияет. */
export function campaignHold(input: {
  status: string;
  sentToday: number;
  dailyLimit: number;
  workTimeStart?: unknown;
  workTimeEnd?: unknown;
  timezone?: unknown;
  now?: Date;
}): CampaignHold | null {
  if (input.status !== "active") return null;
  if (input.sentToday >= Math.max(1, input.dailyLimit)) return "daily_limit";
  const schedule = normalizeSchedule(input);
  if (!isWithinWorkWindow(input.now ?? new Date(), schedule)) return "outside_hours";
  return null;
}
