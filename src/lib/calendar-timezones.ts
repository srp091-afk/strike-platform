export const CALENDAR_TIMEZONES = [
  { id: "UTC", label: "UTC" },
  { id: "Europe/Moscow", label: "Москва (UTC+3)" },
  { id: "Asia/Dubai", label: "Дубай (UTC+4)" },
  { id: "Asia/Tbilisi", label: "Тбилиси (UTC+4)" },
  { id: "Europe/Berlin", label: "Берлин (UTC+1)" },
  { id: "Europe/Bratislava", label: "Братислава (UTC+1)" },
  { id: "America/New_York", label: "Нью-Йорк" },
] as const;

export type CalendarTimezone = (typeof CALENDAR_TIMEZONES)[number]["id"];

export function isCalendarTimezone(value: string): value is CalendarTimezone {
  return CALENDAR_TIMEZONES.some((item) => item.id === value);
}

/** Момент, когда в указанной таймзоне на часах ровно эта дата и время. */
export function zonedInstant(date: string, hours: number, minutes: number, timeZone: string) {
  const wall = Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
    hours,
    minutes,
    0,
  );
  let instant = new Date(wall - timeZoneOffset(new Date(wall), timeZone));
  instant = new Date(wall - timeZoneOffset(instant, timeZone));
  return instant;
}

export function formatClock(date: Date, timeZone: string) {
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return text.replace("24:", "00:");
}

export function currentDateLabel(timeZone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());
}

function timeZoneOffset(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour") % 24, pick("minute"), pick("second"));
  return asUtc - instant.getTime();
}
