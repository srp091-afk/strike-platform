import "server-only";

import { cache } from "react";

import {
  readActiveChannels,
  readHandoffDuration,
  readMessageLimit,
  readResponseDelay,
  readSplitMessages,
  type AgentRecord,
} from "@/lib/agent-models";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const WORKSPACE_EMAIL = "owner@strike.local";

export async function getExistingWorkspaceUserId() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return (data?.[0]?.id as string | undefined) ?? null;
}

export const getWorkspaceUserId = cache(async () => {
  const existing = await getExistingWorkspaceUserId();
  if (existing) return existing;

  const supabase = createSupabaseAdminClient();

  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (listError) {
    throw new Error(listError.message);
  }

  const listedUser = listed.users.find((user) => user.email === WORKSPACE_EMAIL);
  const userId = listedUser?.id ?? (await createWorkspaceUser(supabase));

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    full_name: "STRIKE",
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

  return userId;
});

async function createWorkspaceUser(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: WORKSPACE_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: "STRIKE" },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Не удалось создать профиль");
  }

  return data.user.id;
}

export async function listAgents(): Promise<AgentRecord[]> {
  const supabase = createSupabaseAdminClient();
  const userId = await getAuthenticatedUserId();
  const withDelay = await supabase
    .from("agents")
    .select("id, name, system_prompt, model, temperature, is_active, active_channels, response_delay, human_handoff_duration, limit_agent_messages, limit_client_messages, limit_total_messages, split_messages, wa_instance_id, wa_api_token, wa_phone_number, wa_is_active, tg_bot_username, tg_is_active, telegram_chat_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const rows =
    withDelay.error?.message.includes("telegram_chat_id") ||
    withDelay.error?.message.includes("limit_agent_messages") ||
    withDelay.error?.message.includes("human_handoff_duration") ||
    withDelay.error?.message.includes("split_messages")
      ? await supabase
          .from("agents")
          .select("id, name, system_prompt, model, temperature, is_active, active_channels, response_delay, split_messages, wa_phone_number, wa_is_active, tg_bot_username, tg_is_active, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
      : withDelay;

  const listed = rows.error?.message?.includes("split_messages")
    ? await supabase
        .from("agents")
        .select("id, name, system_prompt, model, temperature, is_active, active_channels, response_delay, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
    : rows;

  if (listed.error) {
    throw new Error(listed.error.message);
  }

  return (listed.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    system_prompt: row.system_prompt as string,
    model: row.model as string,
    temperature: Number(row.temperature),
    is_active: Boolean(row.is_active),
    created_at: row.created_at as string,
    active_channels: readActiveChannels("active_channels" in row ? row.active_channels : undefined),
    response_delay: readResponseDelay("response_delay" in row ? row.response_delay : 0),
    human_handoff_duration: readHandoffDuration(
      "human_handoff_duration" in row ? row.human_handoff_duration : "1_hour",
    ),
    limit_agent_messages: readMessageLimit("limit_agent_messages" in row ? row.limit_agent_messages : 0),
    limit_client_messages: readMessageLimit("limit_client_messages" in row ? row.limit_client_messages : 0),
    limit_total_messages: readMessageLimit("limit_total_messages" in row ? row.limit_total_messages : 0),
    split_messages: readSplitMessages("split_messages" in row ? row.split_messages : false),
    waInstanceId: "wa_instance_id" in row && row.wa_instance_id ? String(row.wa_instance_id) : null,
    waApiToken: "wa_api_token" in row && row.wa_api_token ? String(row.wa_api_token) : null,
    waPhoneNumber: "wa_phone_number" in row && row.wa_phone_number ? String(row.wa_phone_number) : null,
    waIsActive: "wa_is_active" in row ? row.wa_is_active === true : false,
    tgBotUsername: "tg_bot_username" in row && row.tg_bot_username ? String(row.tg_bot_username) : null,
    tgIsActive: "tg_is_active" in row ? row.tg_is_active === true : false,
    telegram_chat_id: "telegram_chat_id" in row && row.telegram_chat_id ? String(row.telegram_chat_id) : null,
  }));
}

export async function getDashboardCounts() {
  const supabase = createSupabaseAdminClient();
  const [agents, conversations, messages] = await Promise.all([
    supabase.from("agents").select("id", { count: "exact", head: true }),
    supabase.from("conversations").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }),
  ]);

  const error = agents.error?.message ?? conversations.error?.message ?? messages.error?.message ?? null;

  return {
    agents: agents.count ?? 0,
    chats: conversations.count ?? 0,
    messages: messages.count ?? 0,
    error,
  };
}
