import "server-only";

import { readDelivery, type DeliveryConfig, type ProactiveChannel } from "@/lib/proactive/delivery";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type SourceCard = { id: string; name: string; type: string; status: string; detail: string };
export type CampaignCard = {
  id: string;
  name: string;
  agentId: string;
  sourceId: string;
  channel: ProactiveChannel;
  goalPrompt: string;
  requireApproval: boolean;
  scheduleCron: string;
  status: string;
  delivery: DeliveryConfig;
  followupConflictMode: "wait_builtin" | "override_builtin";
};
export type TaskCard = {
  id: string;
  campaignId: string;
  contactName: string;
  contactTarget: string;
  channel: ProactiveChannel;
  reasoning: string;
  subject: string;
  message: string;
  status: string;
  scheduledFor: string | null;
  sentAt: string | null;
  error: string | null;
  category: string;
  crmStage: string;
};
export type AgentOption = { id: string; name: string; followupEnabled: boolean };

export async function loadProactiveDesk(userId: string) {
  const admin = createSupabaseAdminClient();
  const [sources, campaigns, tasks, agents, profile] = await Promise.all([
    admin.from("proactive_sources").select("id, name, type, status, config").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    admin.from("proactive_campaigns").select("id, name, agent_id, source_id, channel, goal_prompt, require_approval, schedule_cron, status, delivery_config, followup_conflict_mode").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    admin.from("agent_action_queue").select("id, campaign_id, contact_name, contact_target, channel, ai_reasoning, draft_subject, draft_message, status, scheduled_for, sent_at, error_message, created_at, dialog_category, context_payload").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
    admin.from("agents").select("id, name, followup_enabled").eq("user_id", userId).order("name").limit(100),
    admin.from("profiles").select("timezone").eq("id", userId).maybeSingle(),
  ]);
  const error = sources.error || campaigns.error || tasks.error || agents.error;
  if (error && /proactive_|agent_action_queue|followup_conflict|dialog_category|contact_key/.test(error.message)) {
    return { sources: [], campaigns: [], tasks: [], agents: agentOptions(agents.data), timezone: "UTC", migration: true };
  }
  if (error) throw new Error(error.message);
  return {
    sources: (sources.data ?? []).map(sourceCard),
    campaigns: (campaigns.data ?? []).map(campaignCard),
    tasks: (tasks.data ?? []).map(taskCard),
    agents: agentOptions(agents.data),
    timezone: typeof profile.data?.timezone === "string" && profile.data.timezone ? profile.data.timezone : "UTC",
    migration: false,
  };
}

export async function countPendingApprovals(userId: string) {
  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("agent_action_queue")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending_approval");
  if (error) return 0;
  return count ?? 0;
}

function agentOptions(rows: { id: string; name: string | null; followup_enabled?: boolean | null }[] | null): AgentOption[] {
  return (rows ?? []).map((row) => ({ id: row.id, name: row.name?.trim() || "Агент", followupEnabled: row.followup_enabled === true }));
}

function sourceCard(row: { id: string; name: string; type: string; status: string; config: unknown }): SourceCard {
  const config = row.config && typeof row.config === "object" ? (row.config as Record<string, unknown>) : {};
  let detail = "";
  if (row.type === "csv") detail = `Строк: ${Array.isArray(config.rows) ? config.rows.length : 0}`;
  if (row.type === "google_sheets") detail = typeof config.url === "string" ? config.url : "";
  if (row.type === "pipedrive") detail = typeof config.apiToken === "string" && config.apiToken ? "Токен сохранён" : "Нет токена";
  if (row.type === "strike_chats") detail = "Диалоги WhatsApp, Telegram и Instagram";
  if (row.type === "amocrm") detail = "Сделки amoCRM выбранного агента";
  return { id: row.id, name: row.name, type: row.type, status: row.status, detail };
}

function campaignCard(row: {
  id: string;
  name: string;
  agent_id: string;
  source_id: string;
  channel: string;
  goal_prompt: string;
  require_approval: boolean;
  schedule_cron: string | null;
  status: string;
  delivery_config: unknown;
  followup_conflict_mode?: string | null;
}): CampaignCard {
  const channel: ProactiveChannel = row.channel === "email" || row.channel === "telegram" ? row.channel : "whatsapp";
  return {
    id: row.id,
    name: row.name,
    agentId: row.agent_id,
    sourceId: row.source_id,
    channel,
    goalPrompt: row.goal_prompt,
    requireApproval: row.require_approval,
    scheduleCron: row.schedule_cron ?? "",
    status: row.status,
    delivery: readDelivery(row.delivery_config, channel),
    followupConflictMode: row.followup_conflict_mode === "override_builtin" ? "override_builtin" : "wait_builtin",
  };
}

function taskCard(row: {
  id: string;
  campaign_id: string;
  contact_name: string;
  contact_target: string;
  channel: string;
  ai_reasoning: string;
  draft_subject: string | null;
  draft_message: string;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  error_message: string | null;
  dialog_category?: string | null;
  context_payload?: unknown;
}): TaskCard {
  const channel: ProactiveChannel = row.channel === "email" || row.channel === "telegram" ? row.channel : "whatsapp";
  return {
    id: row.id,
    campaignId: row.campaign_id,
    contactName: row.contact_name,
    contactTarget: row.contact_target,
    channel,
    reasoning: row.ai_reasoning,
    subject: row.draft_subject ?? "",
    message: row.draft_message,
    status: row.status,
    scheduledFor: row.scheduled_for,
    sentAt: row.sent_at,
    error: row.error_message,
    category: row.dialog_category ?? "",
    crmStage: stageOf(row.context_payload),
  };
}

function stageOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const stage = (value as { crmStage?: unknown }).crmStage;
  return typeof stage === "string" ? stage : "";
}
