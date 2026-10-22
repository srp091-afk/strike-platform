import "server-only";

import { DEFAULT_WIDGET_SETTINGS, readWidgetText } from "@/lib/agent-models";
import { readBotFlags } from "@/lib/bot-state";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WidgetThread = {
  conversationId: string;
  botActive: boolean;
};

export type WidgetInboxAgent = {
  id: string;
  user_id: string;
  widget_greeting?: unknown;
};

export function readVisitorId(value: unknown) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim()) ? value.trim() : crypto.randomUUID();
}

/** Короткий публичный идентификатор гостя: «Гость a1b2c3». */
export function guestLabel(visitorId: string) {
  const short = visitorId.replace(/-/g, "").slice(0, 6);
  return { name: `Гость ${short}`, handle: short };
}

/**
 * Открывает (или находит) диалог виджета в общих чатах и записывает реплику
 * гостя. Первое сообщение диалога — приветствие из настроек, чтобы история
 * в кабинете совпадала с тем, что гость видит в виджете.
 */
export async function openWidgetThread(
  supabase: Admin,
  input: { agent: WidgetInboxAgent; visitorId: string; userText: string },
): Promise<WidgetThread> {
  const integrationId = await ensureWidgetIntegration(supabase, input.agent);
  const guest = guestLabel(input.visitorId);
  const conversationId = await upsertConversation(supabase, {
    userId: input.agent.user_id,
    agentId: input.agent.id,
    integrationId,
    externalChatId: input.visitorId,
    contactName: guest.name,
    contactHandle: guest.handle,
    preview: input.userText,
  });

  const { count, error: countError } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  if (countError) throw new Error(countError.message);

  if (!count) {
    const greeting = readWidgetText(input.agent.widget_greeting, DEFAULT_WIDGET_SETTINGS.widget_greeting, 1000);
    const { error } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: greeting,
      status: "sent",
    });
    if (error) throw new Error(error.message);
  }

  const { error: inboundError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: input.userText,
    status: "sent",
  });
  if (inboundError) throw new Error(inboundError.message);

  const flags = await readBotFlags(supabase, [conversationId]);
  return { conversationId, botActive: flags.get(conversationId) ?? true };
}

export async function appendWidgetReply(supabase: Admin, conversationId: string, reply: string) {
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: reply,
    status: "sent",
  });
  if (error) throw new Error(error.message);

  const { error: previewError } = await supabase
    .from("conversations")
    .update({
      last_message_preview: reply.slice(0, 140),
      last_message_at: new Date().toISOString(),
    })
    .eq("id", conversationId);
  if (previewError) throw new Error(previewError.message);
}

async function ensureWidgetIntegration(supabase: Admin, agent: WidgetInboxAgent) {
  const externalId = `widget:${agent.id}`;
  const { data: existing, error: lookupError } = await supabase
    .from("integrations")
    .select("id")
    .eq("provider", "widget")
    .eq("external_id", externalId)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing?.id) {
    await supabase
      .from("integrations")
      .update({ agent_id: agent.id, user_id: agent.user_id, status: "connected" })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("integrations")
    .insert({
      user_id: agent.user_id,
      agent_id: agent.id,
      provider: "widget",
      name: "Web Widget",
      status: "connected",
      external_id: externalId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось привязать веб-виджет.");
  return data.id as string;
}

async function upsertConversation(
  supabase: Admin,
  input: {
    userId: string;
    agentId: string;
    integrationId: string;
    externalChatId: string;
    contactName: string;
    contactHandle: string;
    preview: string;
  },
) {
  const { data: existing, error: lookupError } = await supabase
    .from("conversations")
    .select("id")
    .eq("integration_id", input.integrationId)
    .eq("external_chat_id", input.externalChatId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const patch = {
    user_id: input.userId,
    agent_id: input.agentId,
    contact_name: input.contactName,
    contact_handle: input.contactHandle,
    last_message_preview: input.preview.slice(0, 140),
    last_message_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from("conversations").update(patch).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({ ...patch, integration_id: input.integrationId, external_chat_id: input.externalChatId })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось создать диалог виджета.");
  return data.id as string;
}
