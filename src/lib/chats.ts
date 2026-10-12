import "server-only";

import { getExistingWorkspaceUserId } from "@/lib/agents";
import { isBotMarker, readBotFlags, writeBotFlag } from "@/lib/bot-state";
import type { ChatMessage, ChatProvider, ChatThread } from "@/lib/chat-types";
import { integrationProviders } from "@/lib/integration-catalog";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function listConversations(agentId?: string | null): Promise<ChatThread[]> {
  const userId = await getExistingWorkspaceUserId();
  if (!userId) return [];

  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("conversations")
    .select(
      "id, agent_id, contact_name, contact_handle, external_chat_id, last_message_preview, last_message_at, integrations(provider)",
    )
    .eq("user_id", userId);

  if (agentId && isUuid(agentId)) {
    query = query.eq("agent_id", agentId);
  }

  const { data, error } = await query.order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const flags = await readBotFlags(
    supabase,
    rows.map((row) => row.id as string),
  );

  return rows.map((row) => {
    const handle = displayHandle(stringValue(row.external_chat_id), stringValue(row.contact_handle));
    const name = stringValue(row.contact_name);
    const id = row.id as string;
    return {
      id,
      agentId: typeof row.agent_id === "string" ? row.agent_id : null,
      title: name || handle || "Без имени",
      handle,
      provider: readProvider(row.integrations),
      preview: stringValue(row.last_message_preview),
      lastMessageAt: typeof row.last_message_at === "string" ? row.last_message_at : null,
      botActive: flags.get(id) ?? true,
    } satisfies ChatThread;
  });
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  if (!isUuid(conversationId)) return [];
  const userId = await getExistingWorkspaceUserId();
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
  const userId = await getExistingWorkspaceUserId();
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

  const { error } = await supabase.from("conversations").delete().eq("id", conversationId).eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function setConversationBotActive(conversationId: string, active: boolean) {
  if (!isUuid(conversationId)) return { ok: false as const, error: "Диалог не найден." };
  const userId = await getExistingWorkspaceUserId();
  if (!userId) return { ok: false as const, error: "Рабочее пространство не найдено." };

  const supabase = createSupabaseAdminClient();
  return writeBotFlag(supabase, conversationId, userId, active);
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
  const phone = source.replace(/@.*/, "").replace(/[^\d+]/g, "");
  return phone || source;
}

function stringValue(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replaceAll("\\n", "\n").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
