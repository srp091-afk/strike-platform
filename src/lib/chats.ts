import "server-only";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { isBotMarker, readBotFlags, writeBotFlag } from "@/lib/bot-state";
import type { ChatMessage, ChatProvider, ChatThread } from "@/lib/chat-types";
import { integrationProviders } from "@/lib/integration-catalog";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function listConversations(agentId?: string | null): Promise<ChatThread[]> {
  const userId = await getAuthenticatedUserId();
  if (!userId) return [];

  const supabase = createSupabaseAdminClient();
  const rows = await loadConversationRows(supabase, userId, agentId);
  const flags = await readBotFlags(
    supabase,
    rows.map((row) => row.id as string),
  );

  const speakers = await loadWidgetOperators(supabase, rows);

  return rows.map((row) => {
    const handle = displayHandle(stringValue(row.external_chat_id), stringValue(row.contact_handle));
    const name = stringValue(row.contact_name);
    const id = row.id as string;
    const provider = readProvider(row.integrations);
    const agentId = typeof row.agent_id === "string" ? row.agent_id : null;
    return {
      id,
      agentId,
      title: name || handle || "Без имени",
      handle,
      provider,
      preview: stringValue(row.last_message_preview),
      lastMessageAt: typeof row.last_message_at === "string" ? row.last_message_at : null,
      botActive: flags.get(id) ?? true,
      operatorName: provider === "widget" && agentId ? speakers.get(agentId) ?? null : null,
    } satisfies ChatThread;
  });
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  if (!isUuid(conversationId)) return [];
  const userId = await getAuthenticatedUserId();
  if (!userId) return [];

  const supabase = createSupabaseAdminClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (conversationError) throw new Error(conversationError.message);
  if (!conversation) return [];

  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);

  return (data ?? [])
    .reverse()
    .map((row) => ({
      id: row.id as string,
      role: row.role === "assistant" || row.role === "system" ? row.role : "user",
      content: stringValue(row.content),
      createdAt: typeof row.created_at === "string" ? row.created_at : "",
    }))
    .filter((message) => message.content && !isBotMarker(message.content));
}

export async function deleteConversation(conversationId: string) {
  if (!isUuid(conversationId)) return { ok: false as const, error: "Диалог не найден." };
  const userId = await getAuthenticatedUserId();
  if (!userId) return { ok: false as const, error: "Рабочее пространство не найдено." };

  const supabase = createSupabaseAdminClient();
  const { data: owned, error: ownedError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (ownedError) return { ok: false as const, error: ownedError.message };
  if (!owned) return { ok: false as const, error: "Диалог не найден." };

  const { error: messagesError } = await supabase.from("messages").delete().eq("conversation_id", conversationId);
  if (messagesError) return { ok: false as const, error: messagesError.message };

  const { error: clearError } = await supabase
    .from("conversations")
    .update({
      context_cleared_at: new Date().toISOString(),
      last_message_preview: null,
      last_message_at: null,
      unread_count: 0,
      is_bot_active: true,
      bot_paused_until: null,
      is_processing: false,
    })
    .eq("id", conversationId)
    .eq("user_id", userId);

  if (!clearError) return { ok: true as const };
  if (!clearError.message.includes("context_cleared_at")) {
    return { ok: false as const, error: clearError.message };
  }

  console.error("[chats] context reset", clearError.message);
  const { error } = await supabase.from("conversations").delete().eq("id", conversationId).eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function setConversationBotActive(conversationId: string, active: boolean) {
  if (!isUuid(conversationId)) return { ok: false as const, error: "Диалог не найден." };
  const userId = await getAuthenticatedUserId();
  if (!userId) return { ok: false as const, error: "Рабочее пространство не найдено." };

  const supabase = createSupabaseAdminClient();
  return writeBotFlag(supabase, conversationId, userId, active);
}

type ConversationRow = {
  id: string;
  agent_id: string | null;
  contact_name: string | null;
  contact_handle: string | null;
  external_chat_id: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  context_cleared_at?: string | null;
  integrations: unknown;
};

async function loadConversationRows(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  agentId?: string | null,
): Promise<ConversationRow[]> {
  const listed = await conversationQuery(supabase, userId, agentId, true);
  const result = listed.error?.message.includes("context_cleared_at")
    ? await conversationQuery(supabase, userId, agentId, false)
    : listed;
  if (result.error) throw new Error(result.error.message);

  return ((result.data ?? []) as ConversationRow[]).filter((row) => !(row.context_cleared_at && !row.last_message_at));
}

async function conversationQuery(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  agentId: string | null | undefined,
  withReset: boolean,
) {
  const filter = await agentFilter(supabase, agentId);
  const ordered = withReset
    ? supabase
        .from("conversations")
        .select(
          "id, agent_id, contact_name, contact_handle, external_chat_id, last_message_preview, last_message_at, context_cleared_at, integrations(provider)",
        )
        .eq("user_id", userId)
    : supabase
        .from("conversations")
        .select(
          "id, agent_id, contact_name, contact_handle, external_chat_id, last_message_preview, last_message_at, integrations(provider)",
        )
        .eq("user_id", userId);
  const query = filter ? ordered.or(filter) : ordered;
  return query.order("last_message_at", { ascending: false, nullsFirst: false });
}

async function agentFilter(supabase: ReturnType<typeof createSupabaseAdminClient>, agentId?: string | null) {
  if (!agentId || !isUuid(agentId)) return "";
  const { data: links, error: linkError } = await supabase.from("integrations").select("id").eq("agent_id", agentId);
  if (linkError) throw new Error(linkError.message);
  const integrationIds = (links ?? []).map((row) => row.id as string).filter((id) => isUuid(id));
  const clauses = [`agent_id.eq.${agentId}`];
  if (integrationIds.length > 0) clauses.push(`integration_id.in.(${integrationIds.join(",")})`);
  return clauses.join(",");
}

function readProvider(value: unknown): ChatProvider {
  const record = Array.isArray(value) ? value[0] : value;
  if (!record || typeof record !== "object") return "unknown";
  const provider = "provider" in record ? record.provider : null;
  if (typeof provider === "string" && integrationProviders.includes(provider as (typeof integrationProviders)[number])) {
    return provider as ChatProvider;
  }
  return "unknown";
}

function displayHandle(externalChatId: string, contactHandle: string) {
  const source = contactHandle || externalChatId;
  if (!source) return "";
  const local = source.replace(/@.*/, "");
  const digits = local.replace(/\D/g, "");
  const letters = local.replace(/[^a-z]/gi, "");
  if (letters.length === 0 && digits.length >= 7) return digits;
  return local;
}

/** Имя оператора виджета по агенту. Колонки widget_* могут ещё не быть в базе. */
async function loadWidgetOperators(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  rows: ConversationRow[],
) {
  const names = new Map<string, string>();
  const agentIds = [...new Set(rows.map((row) => row.agent_id).filter((id): id is string => typeof id === "string" && isUuid(id)))];
  if (agentIds.length === 0) return names;

  const { data, error } = await supabase
    .from("agents")
    .select("id, widget_operator_name, widget_agent_name")
    .in("id", agentIds);
  if (error) {
    if (error.message.includes("widget_")) return names;
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    const operator = stringValue(row.widget_operator_name) || stringValue(row.widget_agent_name);
    if (typeof row.id === "string" && operator) names.set(row.id, operator);
  }
  return names;
}

function stringValue(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replaceAll("\\n", "\n").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
