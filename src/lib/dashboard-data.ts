import "server-only";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/**
 * В схеме нет статуса «лид». Квалифицированным считаем диалог, созданный в периоде, где:
 *  - клиент написал не менее LEAD_MIN_CLIENT_MESSAGES сообщений (реальная вовлечённость), либо
 *  - диалог передан живому оператору (бот на паузе).
 */
const LEAD_MIN_CLIENT_MESSAGES = 3;
const MINUTES_PER_AI_MESSAGE = 2;
const DAY_MS = 86_400_000;
const PERIOD_DAYS = 30;
const SPARK_BINS = 10;
const TIME_ZONE = "Europe/Moscow";
const PAGE = 1000;
const MAX_PAGES = 40;

export type MetricStat = {
  value: number;
  /** Изменение к предыдущим 30 дням, %; null, если сравнивать не с чем. */
  delta: number | null;
  points: number[];
};

export type ChartChannel = "whatsapp" | "telegram" | "web_widget";

export type LoadChartData = {
  days: string[];
  series: Record<ChartChannel, number[]>;
};

export type FeedItem = {
  id: string;
  provider: "whatsapp" | "telegram" | "instagram" | "widget";
  name: string;
  status: { label: string; tone: "brand" | "green" | "amber" | "gray" };
  preview: string;
  ago: string;
};

export type DashboardData = {
  error: string | null;
  dialogs: MetricStat;
  leads: MetricStat;
  hours: MetricStat;
  conversion: MetricStat;
  chart: LoadChartData;
  feed: FeedItem[];
};

type ConversationRow = {
  id: string;
  integration_id: string | null;
  created_at: string;
  is_bot_active: boolean | null;
  bot_paused_until: string | null;
};

type MessageRow = { conversation_id: string; role: string; created_at: string };

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export async function getDashboardData(): Promise<DashboardData> {
  const userId = await getAuthenticatedUserId();
  const supabase = createSupabaseAdminClient();
  const now = Date.now();
  const periodStart = now - PERIOD_DAYS * DAY_MS;
  const prevStart = now - 2 * PERIOD_DAYS * DAY_MS;
  const sinceIso = new Date(prevStart).toISOString();

  try {
    const [conversations, integrations, messages, feedRows] = await Promise.all([
      fetchAll<ConversationRow>((from, to) =>
        supabase
          .from("conversations")
          .select("id, integration_id, created_at, is_bot_active, bot_paused_until")
          .eq("user_id", userId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .range(from, to),
      ),
      supabase.from("integrations").select("id, provider").eq("user_id", userId),
      fetchAll<MessageRow & { conversations: { integration_id: string | null } | null }>((from, to) =>
        supabase
          .from("messages")
          .select("conversation_id, role, created_at, conversations!inner(user_id, integration_id)")
          .eq("conversations.user_id", userId)
          .gte("created_at", sinceIso)
          .order("created_at", { ascending: false })
          .range(from, to) as never,
      ),
      supabase
        .from("conversations")
        .select(
          "id, integration_id, contact_name, contact_handle, external_chat_id, last_message_preview, unread_count, is_bot_active, bot_paused_until, updated_at",
        )
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(6),
    ]);

    if (integrations.error) throw new Error(integrations.error.message);
    if (feedRows.error) throw new Error(feedRows.error.message);

    const providerById = new Map<string, string>();
    for (const row of integrations.data ?? []) providerById.set(row.id as string, row.provider as string);

    // Сообщения клиентов по диалогам (для квалификации лидов) и счётчик ответов AI.
    const clientMessages = new Map<string, number>();
    let aiCurrent = 0;
    let aiPrevious = 0;
    const aiTimes: number[] = [];
    for (const message of messages) {
      const time = new Date(message.created_at).getTime();
      if (message.role === "user") {
        clientMessages.set(message.conversation_id, (clientMessages.get(message.conversation_id) ?? 0) + 1);
      } else if (message.role === "assistant") {
        if (time >= periodStart) {
          aiCurrent += 1;
          aiTimes.push(time);
        } else {
          aiPrevious += 1;
        }
      }
    }

    const isHandoff = (c: { is_bot_active: boolean | null; bot_paused_until: string | null }) =>
      c.is_bot_active === false || (c.bot_paused_until !== null && new Date(c.bot_paused_until).getTime() > now);
    const isLead = (c: ConversationRow) =>
      isHandoff(c) || (clientMessages.get(c.id) ?? 0) >= LEAD_MIN_CLIENT_MESSAGES;

    const current = conversations.filter((c) => new Date(c.created_at).getTime() >= periodStart);
    const previous = conversations.filter((c) => new Date(c.created_at).getTime() < periodStart);
    const currentLeads = current.filter(isLead);
    const previousLeads = previous.filter(isLead);

    const hoursOf = (count: number) => round1((count * MINUTES_PER_AI_MESSAGE) / 60);
    const rate = (leads: number, total: number) => (total > 0 ? round1((leads / total) * 100) : 0);

    const times = (items: ConversationRow[]) => items.map((c) => new Date(c.created_at).getTime());
    const convPoints = cumulativeFree(times(current), periodStart, now);
    const leadPoints = cumulativeFree(times(currentLeads), periodStart, now);
    const hourPoints = cumulativeFree(aiTimes, periodStart, now).map((v) => round1((v * MINUTES_PER_AI_MESSAGE) / 60));
    const rateBins = convPoints.map((total, i) => rate(leadPoints[i], total));

    // График нагрузки: входящие сообщения клиентов за 7 дней по каналам.
    const dayKeys: string[] = [];
    const dayLabels: string[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date(now - i * DAY_MS);
      dayKeys.push(dayKey(date));
      dayLabels.push(capitalize(new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: TIME_ZONE }).format(date)));
    }
    const series: Record<ChartChannel, number[]> = {
      whatsapp: dayKeys.map(() => 0),
      telegram: dayKeys.map(() => 0),
      web_widget: dayKeys.map(() => 0),
    };
    for (const message of messages) {
      if (message.role !== "user") continue;
      const index = dayKeys.indexOf(dayKey(new Date(message.created_at)));
      if (index === -1) continue;
      const provider = providerById.get(message.conversations?.integration_id ?? "");
      const channel: ChartChannel | null =
        provider === "whatsapp" ? "whatsapp" : provider === "telegram" ? "telegram" : provider === "widget" ? "web_widget" : null;
      if (channel) series[channel][index] += 1;
    }

    const feed: FeedItem[] = (feedRows.data ?? []).map((row) => {
      const provider = (providerById.get((row.integration_id as string) ?? "") ?? "widget") as FeedItem["provider"];
      const handoff = isHandoff({
        is_bot_active: row.is_bot_active as boolean | null,
        bot_paused_until: row.bot_paused_until as string | null,
      });
      const unread = Number(row.unread_count ?? 0);
      return {
        id: row.id as string,
        provider,
        name:
          (row.contact_name as string | null)?.trim() ||
          (row.contact_handle as string | null)?.trim() ||
          shortenId(row.external_chat_id as string),
        status: handoff
          ? { label: "Оператор", tone: "amber" }
          : unread > 0
            ? { label: "Новое", tone: "brand" }
            : { label: "Бот отвечает", tone: "green" },
        preview: ((row.last_message_preview as string | null) ?? "").trim() || "Диалог без сообщений",
        ago: timeAgo(new Date(row.updated_at as string).getTime(), now),
      };
    });

    return {
      error: null,
      dialogs: { value: current.length, delta: delta(current.length, previous.length), points: convPoints },
      leads: { value: currentLeads.length, delta: delta(currentLeads.length, previousLeads.length), points: leadPoints },
      hours: { value: hoursOf(aiCurrent), delta: delta(aiCurrent, aiPrevious), points: hourPoints },
      conversion: {
        value: rate(currentLeads.length, current.length),
        delta: previous.length > 0 ? round1(rate(currentLeads.length, current.length) - rate(previousLeads.length, previous.length)) : null,
        points: rateBins,
      },
      chart: { days: dayLabels, series },
      feed,
    };
  } catch (error) {
    const empty: MetricStat = { value: 0, delta: null, points: Array.from({ length: SPARK_BINS }, () => 0) };
    return {
      error: error instanceof Error ? error.message : "Не удалось загрузить данные дашборда.",
      dialogs: empty,
      leads: empty,
      hours: empty,
      conversion: empty,
      chart: { days: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"], series: { whatsapp: [], telegram: [], web_widget: [] } },
      feed: [],
    };
  }
}

/** Нарастающий итог по SPARK_BINS равным интервалам периода. */
function cumulativeFree(times: number[], start: number, end: number) {
  const bin = (end - start) / SPARK_BINS;
  const out = Array.from({ length: SPARK_BINS }, () => 0);
  for (const time of times) {
    if (time < start || time > end) continue;
    out[Math.min(SPARK_BINS - 1, Math.floor((time - start) / bin))] += 1;
  }
  let sum = 0;
  return out.map((count) => (sum += count));
}

function delta(current: number, previous: number) {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function dayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

function capitalize(value: string) {
  const clean = value.replace(".", "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function shortenId(id: string) {
  const clean = id.replace(/@.*$/, "");
  return clean.length > 14 ? `Клиент …${clean.slice(-6)}` : clean;
}

export function timeAgo(time: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} дн назад`;
}
