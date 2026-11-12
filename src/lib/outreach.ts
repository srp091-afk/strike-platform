import "server-only";

import { effectiveActiveChannels, telegramChannelLabel } from "@/lib/agent-models";
import { listAgents } from "@/lib/agents";
import { enqueueAt } from "@/lib/outreach-queue";
import { normalizeSchedule, planSendDelays, zonedDayStart } from "@/lib/outreach-schedule";
import {
  readOutreachChannel,
  readOutreachStatus,
  type OutreachAgentOption,
  type OutreachCampaign,
  type OutreachCampaignCard,
  type OutreachCounts,
  type OutreachLog,
  type OutreachLogStatus,
} from "@/lib/outreach-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const CAMPAIGN_COLUMNS =
  "id, name, agent_id, channel_type, outreach_prompt, min_delay_minutes, max_delay_minutes, daily_limit, status, source_columns, contact_column, website_column, name_column, social_column, message_type, fixed_message, fallback_message, language, delay_mode, fixed_delay_minutes, webhook_url, created_at";

const SCHEDULE_COLUMNS = `${CAMPAIGN_COLUMNS}, work_time_start, work_time_end, timezone`;
const SCHEDULE_COLUMNS_WITH_FLAG = `${SCHEDULE_COLUMNS}, timezone_is_default`;

function missingScheduleColumn(message: string) {
  return /work_time_start|work_time_end|timezone/.test(message);
}

export function mapCampaign(row: Record<string, unknown>): OutreachCampaign {
  return {
    id: String(row.id),
    name: typeof row.name === "string" && row.name.trim() ? row.name : "Без названия",
    agent_id: typeof row.agent_id === "string" ? row.agent_id : null,
    channel_type: readOutreachChannel(row.channel_type),
    outreach_prompt: typeof row.outreach_prompt === "string" ? row.outreach_prompt : "",
    min_delay_minutes: Number(row.min_delay_minutes ?? 3),
    max_delay_minutes: Number(row.max_delay_minutes ?? 8),
    daily_limit: Number(row.daily_limit ?? 50),
    status: readOutreachStatus(row.status),
    source_columns: Array.isArray(row.source_columns) ? row.source_columns.map(String) : [],
    contact_column: typeof row.contact_column === "string" ? row.contact_column : null,
    website_column: typeof row.website_column === "string" ? row.website_column : null,
    name_column: typeof row.name_column === "string" ? row.name_column : null,
    social_column: typeof row.social_column === "string" ? row.social_column : null,
    message_type: row.message_type === "fixed" ? "fixed" : "ai",
    fixed_message: typeof row.fixed_message === "string" ? row.fixed_message : "",
    fallback_message: typeof row.fallback_message === "string" ? row.fallback_message : "",
    language: typeof row.language === "string" && row.language.trim() ? row.language : "Русский",
    delay_mode: row.delay_mode === "fixed" ? "fixed" : "random",
    fixed_delay_minutes: Number(row.fixed_delay_minutes ?? 5),
    webhook_url: typeof row.webhook_url === "string" ? row.webhook_url : null,
    work_time_start: typeof row.work_time_start === "string" ? row.work_time_start : "00:00",
    work_time_end: typeof row.work_time_end === "string" ? row.work_time_end : "23:59",
    timezone: typeof row.timezone === "string" && row.timezone.trim() ? row.timezone : "UTC",
    timezone_is_default: typeof row.timezone_is_default === "boolean" ? row.timezone_is_default : null,
    created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export function mapLog(row: Record<string, unknown>): OutreachLog {
  const data = row.contact_data && typeof row.contact_data === "object" && !Array.isArray(row.contact_data) ? row.contact_data : {};
  const status = row.strike_status === "success" || row.strike_status === "error" ? row.strike_status : "queued";
  return {
    id: String(row.id),
    row_index: Number(row.row_index ?? 0),
    contact_data: Object.fromEntries(Object.entries(data as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")])),
    strike_status: status as OutreachLogStatus,
    strike_sent_time: typeof row.strike_sent_time === "string" ? row.strike_sent_time : null,
    strike_message: typeof row.strike_message === "string" ? row.strike_message : null,
    strike_error:
      row.strike_error === "processing" || row.strike_error === "scheduled" || typeof row.strike_error !== "string"
        ? null
        : row.strike_error,
  };
}

export async function listAgentOptions(): Promise<OutreachAgentOption[]> {
  const agents = await listAgents();
  return agents.map((agent) => {
    const active = effectiveActiveChannels(agent);
    // Виджет сам не умеет начинать диалог, поэтому для рассылки он не предлагается.
    const channels = (["whatsapp", "telegram", "instagram"] as const).filter((channel) => active[channel]);
    const accounts: OutreachAgentOption["accounts"] = {};
    if (active.whatsapp && agent.waPhoneNumber?.trim()) {
      const phone = agent.waPhoneNumber.trim();
      accounts.whatsapp = /^\d+$/.test(phone) ? `+${phone}` : phone;
    }
    const telegram = telegramChannelLabel(agent);
    if (active.telegram && telegram) accounts.telegram = telegram;
    return { id: agent.id, name: agent.name, channels, accounts };
  });
}

export async function countLogs(campaignIds: string[]): Promise<Map<string, OutreachCounts>> {
  const counts = new Map<string, OutreachCounts>(campaignIds.map((id) => [id, { total: 0, sent: 0, failed: 0, sent_today: 0 }]));
  if (campaignIds.length === 0) return counts;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("outreach_logs")
    .select("campaign_id, strike_status")
    .in("campaign_id", campaignIds)
    .range(0, 49_999);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const entry = counts.get(String(row.campaign_id));
    if (!entry) continue;
    entry.total += 1;
    if (row.strike_status === "success") entry.sent += 1;
    if (row.strike_status === "error") entry.failed += 1;
  }
  return counts;
}

async function campaignRows(load: (columns: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const withFlag = await load(SCHEDULE_COLUMNS_WITH_FLAG);
  if (!withFlag.error) return withFlag.data;
  if (!/timezone_is_default|work_time_start|work_time_end|timezone/.test(withFlag.error.message)) throw new Error(withFlag.error.message);
  const schedule = await load(SCHEDULE_COLUMNS);
  if (!schedule.error) return schedule.data;
  if (!missingScheduleColumn(schedule.error.message)) throw new Error(schedule.error.message);
  const fallback = await load(CAMPAIGN_COLUMNS);
  if (fallback.error) throw new Error(fallback.error.message);
  return fallback.data;
}

export async function listCampaignCards(userId: string): Promise<OutreachCampaignCard[]> {
  const supabase = createSupabaseAdminClient();
  const data = await campaignRows((columns) =>
    supabase.from("outreach_campaigns").select(columns).eq("user_id", userId).order("created_at", { ascending: false }),
  );
  const campaigns = (Array.isArray(data) ? data : []).map((row) => mapCampaign(row as Record<string, unknown>));
  const [counts, sentToday, nameRows] = await Promise.all([
    countLogs(campaigns.map((c) => c.id)),
    countSentToday(campaigns.filter((campaign) => campaign.status === "active")),
    supabase.from("agents").select("id, name").eq("user_id", userId),
  ]);
  if (nameRows.error) throw new Error(nameRows.error.message);
  const names = new Map((nameRows.data ?? []).map((agent) => [String(agent.id), String(agent.name ?? "")]));
  return campaigns.map((campaign) => ({
    ...campaign,
    ...(counts.get(campaign.id) ?? { total: 0, sent: 0, failed: 0, sent_today: 0 }),
    sent_today: sentToday.get(campaign.id) ?? 0,
    agent_name: campaign.agent_id ? (names.get(campaign.agent_id) ?? null) : null,
  }));
}

function oneRow(data: unknown) {
  return data && typeof data === "object" && !Array.isArray(data) ? mapCampaign(data as Record<string, unknown>) : null;
}

export async function getCampaign(userId: string, id: string): Promise<OutreachCampaign | null> {
  const supabase = createSupabaseAdminClient();
  const data = await campaignRows((columns) =>
    supabase.from("outreach_campaigns").select(columns).eq("id", id).eq("user_id", userId).maybeSingle(),
  );
  return oneRow(data);
}

async function getCampaignById(id: string): Promise<OutreachCampaign | null> {
  const supabase = createSupabaseAdminClient();
  const data = await campaignRows((columns) => supabase.from("outreach_campaigns").select(columns).eq("id", id).maybeSingle());
  return oneRow(data);
}

export async function countSentToday(campaigns: Array<Pick<OutreachCampaign, "id" | "timezone">>) {
  const counts = new Map<string, number>(campaigns.map((campaign) => [campaign.id, 0]));
  const active = campaigns.filter((campaign) => campaign.id);
  if (active.length === 0) return counts;
  const supabase = createSupabaseAdminClient();
  await Promise.all(
    active.map(async (campaign) => {
      const since = zonedDayStart(new Date(), normalizeSchedule({ timezone: campaign.timezone }).timezone).toISOString();
      const { count, error } = await supabase
        .from("outreach_logs")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaign.id)
        .eq("strike_status", "success")
        .gte("strike_sent_time", since);
      if (error) throw new Error(error.message);
      counts.set(campaign.id, count ?? 0);
    }),
  );
  return counts;
}

const SCHEDULE_BATCH = 80;

/**
 * Ставит в очередь ещё не запланированные строки: не больше суточного лимита в сутки
 * и только внутри окна работы. Повторный вызов ничего не дублирует, пока прошлые
 * строки висят в очереди со служебной пометкой scheduled.
 */
export async function scheduleOpenBatch(campaignId: string): Promise<{ queued: number; error?: string; opensAt: string | null }> {
  const campaign = await getCampaignById(campaignId);
  if (!campaign || campaign.status !== "active") return { queued: 0, opensAt: null };
  const supabase = createSupabaseAdminClient();
  const { count: scheduled, error: scheduledError } = await supabase
    .from("outreach_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("strike_status", "queued")
    .eq("strike_error", "scheduled");
  if (scheduledError) return { queued: 0, error: scheduledError.message, opensAt: null };
  if ((scheduled ?? 0) > 0) return { queued: 0, opensAt: null };

  const { data: waiting, error } = await supabase
    .from("outreach_logs")
    .select("id, row_index")
    .eq("campaign_id", campaignId)
    .eq("strike_status", "queued")
    .is("strike_error", null)
    .order("row_index", { ascending: true })
    .limit(SCHEDULE_BATCH);
  if (error) return { queued: 0, error: error.message, opensAt: null };
  if (!waiting?.length) return { queued: 0, opensAt: null };

  const sentToday = (await countSentToday([campaign])).get(campaignId) ?? 0;
  const schedule = normalizeSchedule({
    workTimeStart: campaign.work_time_start,
    workTimeEnd: campaign.work_time_end,
    timezone: campaign.timezone,
  });
  const delays = planSendDelays({
    count: waiting.length,
    sentToday,
    dailyLimit: campaign.daily_limit,
    delay: {
      mode: campaign.delay_mode,
      minMinutes: campaign.min_delay_minutes,
      maxMinutes: campaign.max_delay_minutes,
      fixedMinutes: campaign.fixed_delay_minutes,
    },
    schedule,
  });
  if (delays.length === 0) return { queued: 0, error: "В режиме работы нет окна для отправки.", opensAt: null };

  const chosen = waiting.slice(0, delays.length);
  const ids = chosen.map((row) => String(row.id));
  const { data: marked, error: markError } = await supabase
    .from("outreach_logs")
    .update({ strike_error: "scheduled" })
    .in("id", ids)
    .eq("strike_status", "queued")
    .is("strike_error", null)
    .select("id");
  if (markError) return { queued: 0, error: markError.message, opensAt: null };
  const markedIds = new Set((marked ?? []).map((row) => String(row.id)));
  const items = chosen
    .map((row, index) => ({ logId: String(row.id), delaySeconds: delays[index] ?? 0 }))
    .filter((item) => markedIds.has(item.logId));
  if (items.length === 0) return { queued: 0, opensAt: null };

  const result = await enqueueAt(items);
  if (result.queued < items.length) {
    await supabase
      .from("outreach_logs")
      .update({ strike_error: null })
      .in(
        "id",
        items.slice(result.queued).map((item) => item.logId),
      )
      .eq("strike_error", "scheduled");
  }
  const firstDelay = items[0]?.delaySeconds ?? 0;
  return {
    queued: result.queued,
    error: result.error,
    opensAt: firstDelay > 15 ? new Date(Date.now() + firstDelay * 1000).toISOString() : null,
  };
}

/** Случайная строка базы кампании (для тестовой генерации). */
export async function getRandomLog(campaignId: string): Promise<OutreachLog | null> {
  const supabase = createSupabaseAdminClient();
  const { count, error } = await supabase
    .from("outreach_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  if (error) throw new Error(error.message);
  if (!count) return null;
  const offset = Math.floor(Math.random() * count);
  const { data, error: rowError } = await supabase
    .from("outreach_logs")
    .select("id, row_index, contact_data, strike_status, strike_sent_time, strike_message, strike_error")
    .eq("campaign_id", campaignId)
    .order("row_index", { ascending: true })
    .range(offset, offset);
  if (rowError) throw new Error(rowError.message);
  return data?.[0] ? mapLog(data[0] as Record<string, unknown>) : null;
}

export async function listLogs(campaignId: string, limit = 500): Promise<OutreachLog[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("outreach_logs")
    .select("id, row_index, contact_data, strike_status, strike_sent_time, strike_message, strike_error")
    .eq("campaign_id", campaignId)
    .order("row_index", { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapLog(row as Record<string, unknown>));
}

/** Состояние для страницы кампании и поллинга мониторинга. */
export async function loadCampaignState(userId: string, id: string) {
  const campaign = await getCampaign(userId, id);
  if (!campaign) return null;
  const [logs, counts, sentToday] = await Promise.all([listLogs(id), countLogs([id]), countSentToday([campaign])]);
  return {
    campaign,
    logs,
    counts: { ...(counts.get(id) ?? { total: 0, sent: 0, failed: 0, sent_today: 0 }), sent_today: sentToday.get(id) ?? 0 },
  };
}
