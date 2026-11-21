import "server-only";

import { currentDateLabel } from "@/lib/calendar-timezones";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const TIMEOUT_MS = 7000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?$/;

export type YclientsPlatform = "yclients" | "altegio";

export type YclientsCreds = {
  platform: YclientsPlatform;
  companyId: string;
  partnerToken: string;
  userToken: string;
};

export type YclientsService = {
  id: number;
  title: string;
  price_min: number;
  price_max: number;
  duration_min: number;
};

export type YclientsStaff = {
  id: number;
  name: string;
  specialization: string;
};

export type YclientsSlot = {
  time: string;
  datetime: string;
};

export type AgentBooking = {
  creds: YclientsCreds | null;
  dikidiUrl: string | null;
};

type CallResult = { ok: true; data: unknown } | { ok: false; error: string };

/** Пустая строка — YCLIENTS. null — неизвестная платформа. */
export function readYclientsPlatform(value: string): YclientsPlatform | null {
  const platform = value.trim().toLowerCase();
  if (!platform || platform === "yclients") return "yclients";
  if (platform === "altegio") return "altegio";
  return null;
}

/** Пустая строка — поле очищено. null — ID не число. */
export function readYclientsCompanyId(value: string) {
  const id = value.trim();
  if (!id) return "";
  if (!/^\d{1,12}$/.test(id)) return null;
  return id;
}

/** Пустая строка — токен не меняли. null — токен некорректный. */
export function readYclientsToken(value: string) {
  const token = value.trim();
  if (!token) return "";
  if (token.length < 8 || token.length > 500 || /\s/.test(token)) return null;
  return token;
}

/** Пустая строка — ссылка очищена. null — это не адрес онлайн-записи DIKIDI. */
export function readDikidiBookingUrl(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const allowed =
    host === "dikidi.net" ||
    host === "dikidi.ru" ||
    host === "dikidi.app" ||
    host.endsWith(".dikidi.net") ||
    host.endsWith(".dikidi.ru") ||
    host.endsWith(".dikidi.app");
  if (!allowed) return null;
  return url.toString().slice(0, 2000);
}

export function bookingSystemRule(platform: YclientsPlatform, timeZone: string) {
  const name = platform === "altegio" ? "Altegio" : "YCLIENTS";
  return `У тебя подключена онлайн-запись (${name}). Текущая дата и время: ${currentDateLabel(timeZone)}. Сначала уточни услугу и желаемый день, проверь свободные слоты через booking_check_slots, предложи 2–3 варианта, возьми имя и телефон клиента и запиши через booking_create_record. Никогда не выдумывай свободное время.`;
}

export function dikidiSystemRule(url: string) {
  return `Для онлайн-записи используй официальную ссылку DIKIDI: ${url}. Когда клиент готов записаться — отправь ему эту ссылку.`;
}

export async function loadAgentBooking(agentId: string): Promise<AgentBooking> {
  const empty: AgentBooking = { creds: null, dikidiUrl: null };
  if (!UUID_PATTERN.test(agentId)) return empty;
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("agents")
      .select("yclients_platform, yclients_company_id, yclients_partner_token, yclients_user_token, dikidi_booking_url")
      .eq("id", agentId)
      .maybeSingle();
    if (error || !data) return empty;
    return bookingFromRow(data);
  } catch (error) {
    console.error("[yclients] load", error instanceof Error ? error.message : error);
    return empty;
  }
}

export async function testYclientsConnection(creds: YclientsCreds): Promise<
  { ok: true; servicesCount: number; staffCount: number } | { ok: false; error: string; servicesCount?: number; staffCount?: number }
> {
  const ready = validateCreds(creds);
  if (!ready.ok) return { ok: false, error: ready.error };

  const services = await yclientsCall(ready.creds, `/book_services/${ready.creds.companyId}`);
  if (!services.ok) return { ok: false, error: services.error };
  const staff = await yclientsCall(ready.creds, `/book_staff/${ready.creds.companyId}`);
  if (!staff.ok) return { ok: false, error: staff.error };

  return { ok: true, servicesCount: readServices(services.data).length, staffCount: readStaff(staff.data).length };
}

export async function getYclientsServices(
  creds: YclientsCreds,
  staffId?: number,
): Promise<{ ok: true; services: YclientsService[] } | { ok: false; error: string }> {
  const ready = validateCreds(creds);
  if (!ready.ok) return ready;
  const query = new URLSearchParams();
  if (staffId && staffId > 0) query.set("staff_id", String(staffId));
  const result = await yclientsCall(ready.creds, `/book_services/${ready.creds.companyId}`, { query });
  if (!result.ok) return result;
  return { ok: true, services: readServices(result.data).slice(0, 40) };
}

export async function getYclientsStaff(
  creds: YclientsCreds,
  serviceIds?: number[],
): Promise<{ ok: true; staff: YclientsStaff[] } | { ok: false; error: string }> {
  const ready = validateCreds(creds);
  if (!ready.ok) return ready;
  const query = new URLSearchParams();
  appendIds(query, "service_ids[]", serviceIds ?? []);
  const result = await yclientsCall(ready.creds, `/book_staff/${ready.creds.companyId}`, { query });
  if (!result.ok) return result;
  return { ok: true, staff: readStaff(result.data).slice(0, 40) };
}

export async function getYclientsSlots(
  creds: YclientsCreds,
  input: { date: string; staffId?: number; serviceIds?: number[] },
): Promise<
  | { ok: true; date: string; slots: YclientsSlot[]; nearest_dates?: string[]; note: string }
  | { ok: false; error: string }
> {
  const ready = validateCreds(creds);
  if (!ready.ok) return ready;
  if (!DATE_PATTERN.test(input.date)) return { ok: false, error: "Дата нужна в формате YYYY-MM-DD." };

  const staffId = input.staffId && input.staffId > 0 ? input.staffId : 0;
  const query = new URLSearchParams();
  appendIds(query, "service_ids[]", input.serviceIds ?? []);
  const times = await yclientsCall(ready.creds, `/book_times/${ready.creds.companyId}/${staffId}/${input.date}`, { query });
  if (!times.ok) return times;

  const slots = readSlots(times.data).slice(0, 24);
  if (slots.length > 0) {
    return { ok: true, date: input.date, slots, note: "Предложи клиенту 2–3 окна из списка. Не называй время, которого нет в slots." };
  }

  const datesQuery = new URLSearchParams();
  datesQuery.set("staff_id", String(staffId));
  appendIds(datesQuery, "service_ids[]", input.serviceIds ?? []);
  const dates = await yclientsCall(ready.creds, `/book_dates/${ready.creds.companyId}`, { query: datesQuery });
  const nearest = dates.ok ? nearestDates(dates.data, input.date) : [];
  const note = nearest.length
    ? "На эту дату свободных окон нет. Предложи ближайшие даты из nearest_dates и проверь одну из них."
    : "На эту дату свободных окон нет, и ближайшие даты API не вернул.";
  return { ok: true, date: input.date, slots: [], nearest_dates: nearest, note };
}

export async function createYclientsRecord(
  creds: YclientsCreds,
  input: { phone: string; fullname: string; email?: string; comment?: string; staffId: number; serviceIds: number[]; datetime: string },
): Promise<{ ok: true; recordId: string; datetime: string; phone: string } | { ok: false; error: string }> {
  const ready = validateCreds(creds);
  if (!ready.ok) return ready;
  const phone = normalizeBookingPhone(input.phone);
  if (!phone) return { ok: false, error: "Телефон клиента нужен в международном формате, только цифры." };
  const fullname = input.fullname.trim().slice(0, 120);
  if (fullname.length < 2) return { ok: false, error: "Нужно имя клиента." };
  if (!Number.isInteger(input.staffId) || input.staffId <= 0) return { ok: false, error: "Нужен staff_id мастера." };
  if (!input.serviceIds.length || input.serviceIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { ok: false, error: "Нужен хотя бы один service_id услуги." };
  }
  const datetime = input.datetime.trim();
  if (!DATETIME_PATTERN.test(datetime)) return { ok: false, error: "datetime нужен как 2026-11-25T15:00:00." };

  const comment = ["Записано через STRIKE AI", input.comment?.trim() || ""].filter(Boolean).join(". ").slice(0, 500);
  const email = input.email?.trim().slice(0, 200) || "";
  const body: Record<string, unknown> = {
    phone,
    fullname,
    comment,
    appointments: [
      {
        id: 1,
        services: input.serviceIds.slice(0, 20),
        staff_id: input.staffId,
        datetime,
      },
    ],
  };
  if (email.includes("@")) body.email = email;

  const result = await yclientsCall(ready.creds, `/book_record/${ready.creds.companyId}`, { method: "POST", body });
  if (!result.ok) return result;
  return { ok: true, recordId: readRecordId(result.data), datetime, phone };
}

export async function runYclientsTool(name: string, rawArgs: string, agentId: string) {
  const args = readArgs(rawArgs);
  if (!args) return JSON.stringify({ ok: false, error: "Аргументы функции не являются JSON." });
  const booking = await loadAgentBooking(agentId);
  if (!booking.creds) return JSON.stringify({ ok: false, error: "Онлайн-запись YCLIENTS / Altegio не подключена." });

  try {
    if (name === "booking_get_services") {
      const staffId = optionalId(args.staff_id);
      if (staffId === undefined) return JSON.stringify({ ok: false, error: "staff_id должен быть числом." });
      return JSON.stringify(await getYclientsServices(booking.creds, staffId));
    }
    if (name === "booking_get_staff") {
      const serviceIds = idList(args.service_ids);
      if (!serviceIds) return JSON.stringify({ ok: false, error: "service_ids должны быть числами." });
      return JSON.stringify(await getYclientsStaff(booking.creds, serviceIds));
    }
    if (name === "booking_check_slots") {
      const serviceIds = idList(args.service_ids);
      const staffId = optionalId(args.staff_id);
      if (!serviceIds || staffId === undefined) return JSON.stringify({ ok: false, error: "staff_id и service_ids должны быть числами." });
      return JSON.stringify(
        await getYclientsSlots(booking.creds, {
          date: typeof args.date === "string" ? args.date.trim() : "",
          staffId,
          serviceIds,
        }),
      );
    }
    if (name === "booking_create_record") {
      const serviceIds = idList(args.service_ids);
      const staffId = optionalId(args.staff_id);
      if (!serviceIds?.length || !staffId) return JSON.stringify({ ok: false, error: "Нужны service_ids и staff_id." });
      const created = await createYclientsRecord(booking.creds, {
        phone: textArg(args.phone),
        fullname: textArg(args.fullname),
        email: textArg(args.email),
        comment: textArg(args.comment),
        staffId,
        serviceIds,
        datetime: textArg(args.datetime),
      });
      if (!created.ok) return JSON.stringify(created);
      const labels = await bookingLabels(booking.creds, serviceIds, staffId);
      return JSON.stringify({
        ok: true,
        recordId: created.recordId,
        datetime: created.datetime,
        phone: created.phone,
        fullname: textArg(args.fullname).trim(),
        service: labels.service,
        staff: labels.staff,
      });
    }
    return JSON.stringify({ ok: false, error: "Неизвестная функция онлайн-записи." });
  } catch (error) {
    console.error("[yclients]", agentId, error instanceof Error ? error.message : error);
    return JSON.stringify({ ok: false, error: "Не удалось выполнить действие в онлайн-записи." });
  }
}

export function normalizeBookingPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length < 8 || digits.length > 15) return "";
  return digits;
}

function validateCreds(creds: YclientsCreds): { ok: true; creds: YclientsCreds } | { ok: false; error: string } {
  const platform = readYclientsPlatform(creds.platform);
  const companyId = readYclientsCompanyId(creds.companyId);
  const partnerToken = readYclientsToken(creds.partnerToken);
  const userToken = creds.userToken.trim() ? readYclientsToken(creds.userToken) : "";
  if (!platform) return { ok: false, error: "Платформа записи — YCLIENTS или Altegio." };
  if (!companyId) return { ok: false, error: "Укажите ID филиала." };
  if (!partnerToken) return { ok: false, error: "Укажите Partner Token." };
  if (userToken === null) return { ok: false, error: "User Token содержит пробелы или слишком короткий." };
  return { ok: true, creds: { platform, companyId, partnerToken, userToken } };
}

async function yclientsCall(
  creds: YclientsCreds,
  path: string,
  init?: { method?: "GET" | "POST"; query?: URLSearchParams; body?: unknown },
): Promise<CallResult> {
  const label = creds.platform === "altegio" ? "Altegio" : "YCLIENTS";
  const base = creds.platform === "altegio" ? "https://api.alteg.io/api/v1" : "https://api.yclients.com/api/v1";
  const query = init?.query?.toString();
  const url = `${base}${path}${query ? `?${query}` : ""}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: init?.method ?? "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.yclients.v2+json",
        "Content-Type": "application/json",
        Authorization: creds.userToken ? `Bearer ${creds.partnerToken}, User ${creds.userToken}` : `Bearer ${creds.partnerToken}`,
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (response.status >= 300 && response.status < 400) return { ok: false, error: `${label} вернул перенаправление.` };
    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }
    const record = asRecord(payload);
    const failed = !response.ok || record.success === false;
    if (failed) return { ok: false, error: errorText(label, response.status, record) };
    return { ok: true, data: "data" in record ? record.data : payload };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, error: aborted ? `${label} не ответил за 7 секунд.` : `Не удалось связаться с ${label}.` };
  } finally {
    clearTimeout(timer);
  }
}

function errorText(label: string, status: number, record: Record<string, unknown>) {
  const meta = record.meta;
  if (Array.isArray(meta)) {
    const message = asRecord(meta[0]).message;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 300);
  }
  const metaRecord = asRecord(meta);
  if (typeof metaRecord.message === "string" && metaRecord.message.trim()) return metaRecord.message.trim().slice(0, 300);
  if (typeof record.message === "string" && record.message.trim()) return record.message.trim().slice(0, 300);
  return `${label} ответил HTTP ${status}.`;
}

function readServices(data: unknown): YclientsService[] {
  const source = Array.isArray(data) ? data : asRecord(data).services;
  if (!Array.isArray(source)) return [];
  const services: YclientsService[] = [];
  for (const item of source) {
    const row = asRecord(item);
    if (row.active === 0 || row.active === false) continue;
    const id = positiveId(row.id);
    const title = textArg(row.title).trim();
    if (!id || !title) continue;
    const seconds = numberArg(row.seance_length) || numberArg(row.duration) || numberArg(row.length);
    services.push({
      id,
      title: title.slice(0, 80),
      price_min: numberArg(row.price_min),
      price_max: numberArg(row.price_max) || numberArg(row.price_min),
      duration_min: seconds > 0 ? Math.max(1, Math.round(seconds / 60)) : 0,
    });
  }
  return services;
}

function readStaff(data: unknown): YclientsStaff[] {
  const record = asRecord(data);
  const source = Array.isArray(data) ? data : record.staff ?? record.workers;
  if (!Array.isArray(source)) return [];
  const staff: YclientsStaff[] = [];
  for (const item of source) {
    const row = asRecord(item);
    if (row.bookable === false || row.bookable === 0) continue;
    const id = positiveId(row.id);
    const name = textArg(row.name).trim();
    if (!id || !name) continue;
    staff.push({
      id,
      name: name.slice(0, 80),
      specialization: textArg(row.specialization).trim().slice(0, 80),
    });
  }
  return staff;
}

function readSlots(data: unknown): YclientsSlot[] {
  const source = Array.isArray(data) ? data : asRecord(data).times;
  if (!Array.isArray(source)) return [];
  const slots: YclientsSlot[] = [];
  for (const item of source) {
    const row = asRecord(item);
    const datetime = textArg(row.datetime).trim();
    const time = textArg(row.time).trim() || datetime.match(/T(\d{2}:\d{2})/)?.[1] || "";
    if (!time && !datetime) continue;
    slots.push({ time: time.slice(0, 8), datetime: datetime.slice(0, 32) });
  }
  return slots;
}

function nearestDates(data: unknown, afterDate: string) {
  const dates = new Set<string>();
  const record = asRecord(data);
  collectDateMap(record.booking_days, dates);
  collectDateMap(record.working_days, dates);
  collectDateList(record.booking_dates, dates);
  collectDateList(record.working_dates, dates);
  return [...dates].filter((item) => item > afterDate).sort().slice(0, 7);
}

function collectDateMap(value: unknown, dates: Set<string>) {
  const record = asRecord(value);
  for (const [key, child] of Object.entries(record)) {
    if (!DATE_PATTERN.test(key)) continue;
    const open = child === true || (typeof child === "number" && child > 0) || (Array.isArray(child) && child.length > 0);
    if (open) dates.add(key);
  }
}

function collectDateList(value: unknown, dates: Set<string>) {
  if (!Array.isArray(value)) return;
  for (const item of value) {
    if (typeof item === "string" && DATE_PATTERN.test(item)) dates.add(item);
  }
}

function readRecordId(data: unknown) {
  const list = Array.isArray(data) ? data : [data];
  for (const item of list) {
    const row = asRecord(item);
    const id = row.record_id ?? row.id;
    if (typeof id === "number" && id > 0) return String(id);
    if (typeof id === "string" && /^\d+$/.test(id)) return id;
  }
  return "";
}

async function bookingLabels(creds: YclientsCreds, serviceIds: number[], staffId: number) {
  const [services, staff] = await Promise.all([
    getYclientsServices(creds).catch(() => null),
    getYclientsStaff(creds, serviceIds).catch(() => null),
  ]);
  const titles = services && services.ok ? services.services.filter((item) => serviceIds.includes(item.id)).map((item) => item.title) : [];
  const person = staff && staff.ok ? staff.staff.find((item) => item.id === staffId) : undefined;
  return {
    service: titles.length ? titles.join(", ") : serviceIds.join(", "),
    staff: person ? (person.specialization ? `${person.name}, ${person.specialization}` : person.name) : String(staffId),
  };
}

function bookingFromRow(row: Record<string, unknown>): AgentBooking {
  const companyId = typeof row.yclients_company_id === "string" ? row.yclients_company_id.trim() : "";
  const partnerToken = typeof row.yclients_partner_token === "string" ? row.yclients_partner_token.trim() : "";
  const userToken = typeof row.yclients_user_token === "string" ? row.yclients_user_token.trim() : "";
  const platform = row.yclients_platform === "altegio" ? "altegio" : "yclients";
  const dikidi = typeof row.dikidi_booking_url === "string" ? readDikidiBookingUrl(row.dikidi_booking_url) : "";
  return {
    creds: companyId && partnerToken ? { platform, companyId, partnerToken, userToken } : null,
    dikidiUrl: dikidi || null,
  };
}

function appendIds(query: URLSearchParams, key: string, ids: number[]) {
  for (const id of ids) query.append(key, String(id));
}

function readArgs(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function optionalId(value: unknown) {
  if (value === undefined || value === null || value === "") return 0;
  return positiveId(value) ?? (value === 0 || value === "0" ? 0 : undefined);
}

function idList(value: unknown) {
  if (value === undefined || value === null || value === "") return [];
  const source = Array.isArray(value) ? value : typeof value === "number" ? [value] : typeof value === "string" ? value.split(",") : null;
  if (!source) return null;
  const ids: number[] = [];
  for (const item of source) {
    const id = positiveId(typeof item === "string" ? item.trim() : item);
    if (!id) return null;
    ids.push(id);
  }
  return [...new Set(ids)].slice(0, 20);
}

function positiveId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value) && value !== "0") return Number(value);
  return null;
}

function numberArg(value: unknown) {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : 0;
  return Number.isFinite(number) ? number : 0;
}

function textArg(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
