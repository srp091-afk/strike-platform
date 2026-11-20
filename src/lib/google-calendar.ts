import "server-only";

import { google } from "googleapis";

import { currentDateLabel, formatClock, isCalendarTimezone, zonedInstant } from "@/lib/calendar-timezones";
import { getEffectiveUserId } from "@/lib/account-context";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];
const SLOT_MINUTES = 30;
const DAY_START = 9 * 60;
const DAY_END = 18 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CalendarAgent = {
  refreshToken: string;
  calendarId: string;
  timezone: string;
};

export function calendarRedirectUri(request: Request) {
  const configured = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (configured) return configured;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (site) return `${site}/api/agents/calendar/callback`;
  return `${new URL(request.url).origin}/api/agents/calendar/callback`;
}

export function googleAuthUrl(request: Request, agentId: string) {
  const client = oauthClient(calendarRedirectUri(request));
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state: agentId,
  });
}

export async function exchangeCalendarCode(request: Request, code: string) {
  const client = oauthClient(calendarRedirectUri(request));
  const { tokens } = await client.getToken(code);
  return tokens.refresh_token ?? "";
}

export async function ownedAgent(agentId: string) {
  if (!UUID_PATTERN.test(agentId)) return null;
  const userId = await getEffectiveUserId();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("agents").select("id").eq("id", agentId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return { admin, userId };
}

export async function saveCalendarToken(agentId: string, userId: string, refreshToken: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("agents")
    .update({ gcal_refresh_token: refreshToken })
    .eq("id", agentId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function clearCalendarToken(agentId: string, userId: string) {
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("agents")
    .update({ gcal_refresh_token: null })
    .eq("id", agentId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function saveCalendarTimezone(agentId: string, userId: string, timezone: string) {
  if (!isCalendarTimezone(timezone)) throw new Error("Выберите таймзону из списка.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("agents").update({ gcal_timezone: timezone }).eq("id", agentId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** Таймзона, если календарь подключён. Токен наружу не отдаётся. */
export async function calendarTimezone(agentId: string) {
  const agent = await loadCalendarAgent(agentId);
  return agent?.timezone ?? null;
}

export function calendarSystemRule(timezone: string) {
  return `У тебя подключен Google Календарь. Текущая дата и время: ${currentDateLabel(timezone)}. Если клиент просит записать его, сначала вызови функцию check_availability на нужный день, предложи клиенту 2-3 свободных слота на выбор. Когда он выберет, вызови book_slot.`;
}

export async function getAvailableSlots(agentId: string, date: string, timezone?: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Нужна дата в формате YYYY-MM-DD.");
  const agent = await requireCalendarAgent(agentId);
  const zone = timezone && isCalendarTimezone(timezone) ? timezone : agent.timezone;
  const windowStart = zonedInstant(date, 9, 0, zone);
  const windowEnd = zonedInstant(date, 18, 0, zone);
  const calendar = calendarApi(agent.refreshToken);
  const busy = await calendar.freebusy.query({
    requestBody: {
      timeMin: windowStart.toISOString(),
      timeMax: windowEnd.toISOString(),
      timeZone: zone,
      items: [{ id: agent.calendarId }],
    },
  });
  const blocks = (busy.data.calendars?.[agent.calendarId]?.busy ?? [])
    .map((item) => ({
      start: item.start ? new Date(item.start).getTime() : 0,
      end: item.end ? new Date(item.end).getTime() : 0,
    }))
    .filter((item) => item.end > item.start);

  const slots: string[] = [];
  for (let minute = DAY_START; minute + SLOT_MINUTES <= DAY_END; minute += SLOT_MINUTES) {
    const start = zonedInstant(date, Math.floor(minute / 60), minute % 60, zone);
    const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
    const overlaps = blocks.some((block) => start.getTime() < block.end && end.getTime() > block.start);
    if (overlaps) continue;
    const startLabel = formatClock(start, zone);
    const endLabel = formatClock(end, zone);
    slots.push(
      `${startLabel}-${endLabel} (start_time: ${date}T${startLabel}:00, end_time: ${date}T${endLabel}:00, timezone: ${zone})`,
    );
  }
  return slots;
}

export async function bookAppointment(
  agentId: string,
  startTime: string,
  endTime: string,
  clientName: string,
  clientContact: string,
  summary?: string,
) {
  const agent = await requireCalendarAgent(agentId);
  const name = clientName.trim() || "Клиент";
  const contact = clientContact.trim();
  const calendar = calendarApi(agent.refreshToken);
  const created = await calendar.events.insert({
    calendarId: agent.calendarId,
    requestBody: {
      summary: summary?.trim() || `Встреча: ${name}`,
      description: [`Клиент: ${name}`, contact ? `Контакт: ${contact}` : ""].filter(Boolean).join("\n"),
      start: eventTime(startTime, agent.timezone),
      end: eventTime(endTime, agent.timezone),
    },
  });
  return {
    eventId: created.data.id ?? "",
    link: created.data.htmlLink ?? "",
    summary: created.data.summary ?? `Встреча: ${name}`,
  };
}

export async function runCalendarTool(name: string, rawArgs: string, agentId: string) {
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(rawArgs) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
  } catch {
    return JSON.stringify({ ok: false, error: "Аргументы функции не являются JSON." });
  }
  try {
    if (name === "check_availability") {
      const date = typeof args.date === "string" ? args.date : "";
      const slots = await getAvailableSlots(agentId, date);
      return JSON.stringify({
        ok: true,
        date,
        slots,
        note: slots.length ? "Предложи клиенту 2-3 слота из списка." : "Свободных слотов в этот день нет.",
      });
    }
    if (name === "book_slot") {
      const booked = await bookAppointment(
        agentId,
        textArg(args.start_time),
        textArg(args.end_time),
        textArg(args.client_name),
        textArg(args.client_contact),
      );
      return JSON.stringify({ ok: true, booked });
    }
    return JSON.stringify({ ok: false, error: "Неизвестная функция календаря." });
  } catch (error) {
    console.error("[calendar]", error instanceof Error ? error.message : error);
    const message = error instanceof Error ? error.message : "Не удалось выполнить действие в календаре.";
    return JSON.stringify({ ok: false, error: /не подключ/i.test(message) ? message : "Не удалось выполнить действие в календаре." });
  }
}

function textArg(value: unknown) {
  return typeof value === "string" ? value : "";
}

function eventTime(value: string, timeZone: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Не указано время встречи.");
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const instant = new Date(trimmed);
    if (Number.isNaN(instant.getTime())) throw new Error("Некорректное время встречи.");
    return { dateTime: instant.toISOString(), timeZone };
  }
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (!match) throw new Error("Некорректное время встречи.");
  return { dateTime: `${match[1]}T${match[2]}:00`, timeZone };
}

async function requireCalendarAgent(agentId: string) {
  const agent = await loadCalendarAgent(agentId);
  if (!agent) throw new Error("Google Calendar не подключён.");
  return agent;
}

async function loadCalendarAgent(agentId: string): Promise<CalendarAgent | null> {
  if (!UUID_PATTERN.test(agentId)) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("agents")
    .select("gcal_refresh_token, gcal_calendar_id, gcal_timezone")
    .eq("id", agentId)
    .maybeSingle();
  if (error || !data) return null;
  const refreshToken = typeof data.gcal_refresh_token === "string" ? data.gcal_refresh_token : "";
  if (!refreshToken) return null;
  const timezone = typeof data.gcal_timezone === "string" && isCalendarTimezone(data.gcal_timezone) ? data.gcal_timezone : "UTC";
  const calendarId = typeof data.gcal_calendar_id === "string" && data.gcal_calendar_id ? data.gcal_calendar_id : "primary";
  return { refreshToken, calendarId, timezone };
}

function calendarApi(refreshToken: string) {
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: refreshToken });
  return google.calendar({ version: "v3", auth });
}

function oauthClient(redirectUri?: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Задайте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
