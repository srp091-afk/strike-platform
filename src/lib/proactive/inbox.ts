import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isEvolutionInstance } from "@/lib/evolution-api";

type Admin = SupabaseClient;

/** Кладёт исходящее проактивное сообщение в тот же диалог, который потом увидит ответ клиента. */
export async function recordOutboundChat(
  supabase: Admin,
  input: {
    userId: string;
    agentId: string;
    provider: "whatsapp" | "telegram" | "email";
    externalId: string;
    chatId: string;
    contactName: string;
    message: string;
    context: string;
  },
) {
  const integrationId = await ensureIntegration(supabase, input);
  const chatId = input.chatId.trim();
  if (!integrationId || !chatId) return;
  const existing = await supabase
    .from("conversations")
    .select("id")
    .eq("integration_id", integrationId)
    .eq("external_chat_id", chatId)
    .maybeSingle();
  const preview = input.message.slice(0, 140);
  const now = new Date().toISOString();
  let conversationId = typeof existing.data?.id === "string" ? existing.data.id : "";
  if (!conversationId) {
    const created = await supabase
      .from("conversations")
      .insert({
        user_id: input.userId,
        agent_id: input.agentId,
        integration_id: integrationId,
        external_chat_id: chatId,
        contact_name: input.contactName.slice(0, 160),
        contact_handle: chatId,
        last_message_preview: preview,
        last_message_at: now,
      })
      .select("id")
      .maybeSingle();
    conversationId = typeof created.data?.id === "string" ? created.data.id : "";
  } else {
    await supabase
      .from("conversations")
      .update({
        agent_id: input.agentId,
        contact_name: input.contactName.slice(0, 160),
        last_message_preview: preview,
        last_message_at: now,
      })
      .eq("id", conversationId);
  }
  if (!conversationId) return;
  const content = input.context.trim()
    ? `${input.message.trim()}\n\n[Контекст для продолжения диалога: ${input.context.trim().slice(0, 500)}]`
    : input.message.trim();
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content,
    status: "sent",
  });
}

async function ensureIntegration(
  supabase: Admin,
  input: { userId: string; agentId: string; provider: "whatsapp" | "telegram" | "email"; externalId: string },
) {
  const externalId = input.provider === "whatsapp" && isEvolutionInstance(input.externalId) ? input.externalId.toLowerCase() : input.externalId;
  const found = await supabase
    .from("integrations")
    .select("id")
    .eq("provider", input.provider)
    .eq("external_id", externalId)
    .limit(1)
    .maybeSingle();
  if (found.data?.id) {
    await supabase
      .from("integrations")
      .update({ agent_id: input.agentId, user_id: input.userId, status: "connected" })
      .eq("id", found.data.id);
    return String(found.data.id);
  }
  const created = await supabase
    .from("integrations")
    .insert({
      user_id: input.userId,
      agent_id: input.agentId,
      provider: input.provider,
      name: input.provider === "whatsapp" ? "WhatsApp" : input.provider === "telegram" ? "Telegram" : "Email",
      status: "connected",
      external_id: externalId,
    })
    .select("id")
    .maybeSingle();
  return typeof created.data?.id === "string" ? created.data.id : "";
}
