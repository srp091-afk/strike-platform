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

/** Пояс, который приложение подставило само, а не выбрал пользователь. */
const AUTOMATIC_TIME_ZONES = new Set(["UTC", "Etc/UTC", "Etc/GMT", "Etc/GMT0", "Etc/GMT+0", "Etc/GMT-0"]);

export function isAutomaticTimeZone(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return true;
  return AUTOMATIC_TIME_ZONES.has(value.trim());
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
  let year = Number(bag.year);
  let month = Number(bag.month);
  let day = Number(bag.day);
  // Часть движков пишет полночь как 24:00 того же календарного дня.
  if (hour === 24) {
    hour = 0;
    const next = new Date(Date.UTC(year, month - 1, day + 1));
    year = next.getUTCFullYear();
    month = next.getUTCMonth() + 1;
    day = next.getUTCDate();
  }
  return {
    year,
    month,
    day,
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

/** Минуты местных суток в поясе кампании, а не в поясе сервера. */
export function zonedClockMinutes(now: Date, timeZone: string) {
  const parts = zonedParts(now, timeZone);
  return parts.hour * 60 + parts.minute;
}

export function isWithinWorkWindow(now: Date, schedule: WorkSchedule) {
  const minutes = zonedClockMinutes(now, schedule.timezone);
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

export type TimeZoneChoice = {
  value: string;
  label: string;
  offsetMinutes: number;
};

export function formatUtcOffset(minutes: number) {
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const mins = String(absolute % 60).padStart(2, "0");
  return `UTC${sign}${hours}:${mins}`;
}

export function timeZoneOffsetMinutes(timeZone: string, now = new Date()) {
  const parts = zonedParts(now, readTimeZone(timeZone));
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asUtc - now.getTime()) / 60_000);
}

export function listTimeZoneChoices(now = new Date()): TimeZoneChoice[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];
  const unique = zones.includes("UTC") ? zones : ["UTC", ...zones];
  return unique
    .map((value) => {
      const offsetMinutes = timeZoneOffsetMinutes(value, now);
      return { value, offsetMinutes, label: `(${formatUtcOffset(offsetMinutes)}) ${value}` };
    })
    .sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.label.localeCompare(b.label));
}

function parseOffsetQuery(query: string) {
  const match = query.match(/^(?:utc|gmt)?([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  if (hours > 14) return null;
  const minutes = match[3] === undefined ? null : Number(match[3]);
  if (minutes !== null && minutes >= 60) return null;
  return { hours: sign * hours, minutes: minutes === null ? null : sign * minutes };
}

function offsetMatches(offsetMinutes: number, parsed: { hours: number; minutes: number | null }) {
  if (parsed.minutes === null) return Math.trunc(offsetMinutes / 60) === parsed.hours;
  return offsetMinutes === parsed.hours * 60 + parsed.minutes;
}

/** Поиск по городу, региону и смещению: «Tbilisi», «Europe», «+4», «UTC+3», «-5». */
export function filterTimeZoneChoices(choices: TimeZoneChoice[], query: string) {
  const compact = query.trim().toLowerCase().replace(/[\s_]+/g, "");
  if (!compact) return choices;
  const offset = parseOffsetQuery(compact);
  return choices.filter((choice) => {
    const haystack = `${choice.value} ${choice.label}`.toLowerCase().replace(/[\s_]+/g, "");
    if (haystack.includes(compact)) return true;
    return offset ? offsetMatches(choice.offsetMinutes, offset) : false;
  });
}

/**
 * Свежий план: ближайшая постановка рядом со следующим допустимым слотом.
 * late — план рассчитан на более позднее окно (например, пока пояс был UTC).
 * overdue — время постановки прошло, а воркер так и не пришёл.
 */
export function queueNeedsReplan(input: {
  now: number;
  earliestDispatchAt: number | null;
  nextSlot: number;
  slackMs: number;
  overdueMs: number;
}): "fresh" | "late" | "overdue" | "unknown" {
  if (input.earliestDispatchAt === null) return "unknown";
  if (input.earliestDispatchAt < input.now - input.overdueMs) return "overdue";
  if (input.earliestDispatchAt > input.nextSlot + input.slackMs) return "late";
  return "fresh";
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
