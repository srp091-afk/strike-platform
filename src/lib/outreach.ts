import "server-only";

import { effectiveActiveChannels } from "@/lib/agent-models";
import { listAgents } from "@/lib/agents";
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
  "id, name, agent_id, channel_type, outreach_prompt, min_delay_minutes, max_delay_minutes, daily_limit, status, source_columns, contact_column, website_column, webhook_url, created_at";

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
    webhook_url: typeof row.webhook_url === "string" ? row.webhook_url : null,
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
    strike_error: typeof row.strike_error === "string" ? row.strike_error : null,
  };
}

export async function listAgentOptions(): Promise<OutreachAgentOption[]> {
  const agents = await listAgents();
  return agents.map((agent) => {
    const active = effectiveActiveChannels(agent);
    // Виджет сам не умеет начинать диалог, поэтому для рассылки он не предлагается.
    const channels = (["whatsapp", "telegram", "instagram"] as const).filter((channel) => active[channel]);
    return { id: agent.id, name: agent.name, channels };
  });
}

export async function countLogs(campaignIds: string[]): Promise<Map<string, OutreachCounts>> {
  const counts = new Map<string, OutreachCounts>(campaignIds.map((id) => [id, { total: 0, sent: 0, failed: 0 }]));
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

export async function listCampaignCards(userId: string): Promise<OutreachCampaignCard[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("outreach_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const campaigns = (data ?? []).map((row) => mapCampaign(row as Record<string, unknown>));
  const [counts, agents] = await Promise.all([countLogs(campaigns.map((c) => c.id)), listAgents()]);
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  return campaigns.map((campaign) => ({
    ...campaign,
    ...(counts.get(campaign.id) ?? { total: 0, sent: 0, failed: 0 }),
    agent_name: campaign.agent_id ? (names.get(campaign.agent_id) ?? null) : null,
  }));
}

export async function getCampaign(userId: string, id: string): Promise<OutreachCampaign | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("outreach_campaigns")
    .select(CAMPAIGN_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapCampaign(data as Record<string, unknown>) : null;
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
  const [logs, counts] = await Promise.all([listLogs(id), countLogs([id])]);
  return { campaign, logs, counts: counts.get(id) ?? { total: 0, sent: 0, failed: 0 } };
}
