import type { NextRequest } from "next/server";

import { readBotFlags } from "@/lib/bot-state";
import { sendGreenMessage } from "@/lib/green-api";
import { getOpenAI } from "@/lib/openai";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    await handleIncoming(request);
  } catch (error) {
    console.error("[whatsapp webhook]", error instanceof Error ? error.message : error);
  }

  return Response.json({ ok: true });
}

async function handleIncoming(request: NextRequest) {
  const body = await request.json();
  const incoming = readIncoming(body);
  if (!incoming) return;

  const supabase = createSupabaseAdminClient();
  const channel = await findWhatsAppChannel(supabase);

  if (incoming.messageId) {
    const { data: existing, error: duplicateError } = await supabase
      .from("messages")
      .select("id")
      .eq("external_message_id", incoming.messageId)
      .limit(1);

    if (duplicateError) throw new Error(duplicateError.message);
    if (existing && existing.length > 0) return;
  }

  const { data: agent, error: agentError } = await loadWhatsAppAgent(supabase, channel.agentId);

  if (agentError) throw new Error(agentError.message);
  if (!agent || !agent.is_active) {
    throw new Error("Агент не найден или выключен.");
  }

  const conversation = await upsertConversation(supabase, {
    userId: channel.userId,
    agentId: agent.id as string,
    integrationId: channel.integrationId,
    externalChatId: incoming.from,
    contactName: incoming.contactName,
    preview: incoming.text,
  });
  const conversationId = conversation.id;

  const { error: inboundError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: incoming.text,
    status: "sent",
    external_message_id: incoming.messageId,
  });

  if (inboundError) throw new Error(inboundError.message);
  if (!conversation.botActive) return;
  if (!whatsappChannelEnabled(agent.active_channels)) return;

  const { data: history, error: historyError } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (historyError) throw new Error(historyError.message);

  const dialogue = (history ?? [])
    .reverse()
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content as string,
    }));

  const completion = await getOpenAI().chat.completions.create({
    model: (agent.model as string) || "gpt-4o-mini",
    temperature: clampTemperature(agent.temperature),
    messages: [
      {
        role: "system",
        content: (agent.system_prompt as string) || "You are a STRIKE agent.",
      },
      ...dialogue,
    ],
  });

  const reply = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!reply) throw new Error("Модель вернула пустой ответ.");

  let delivered = false;
  let outboundId: string | null = null;
  try {
    outboundId = await sendGreenMessage(incoming.from, reply);
    delivered = true;
  } catch (error) {
    console.error("[whatsapp webhook] green", error instanceof Error ? error.message : error);
  }

  const { error: outboundError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: reply,
    status: delivered ? "sent" : "failed",
    external_message_id: outboundId,
  });

  if (outboundError) throw new Error(outboundError.message);

  const { error: previewError } = await supabase
    .from("conversations")
    .update({
      last_message_preview: reply.slice(0, 140),
      last_message_at: new Date().toISOString(),
      agent_id: agent.id,
    })
    .eq("id", conversationId);

  if (previewError) throw new Error(previewError.message);
}

type IncomingText = {
  from: string;
  text: string;
  messageId: string | null;
  contactName: string | null;
};

function readIncoming(body: unknown): IncomingText | null {
  const record = asRecord(body);
  if (record.typeWebhook !== "incomingMessageReceived") return null;

  const sender = asRecord(record.senderData);
  const message = asRecord(record.messageData);
  const textMessage = asRecord(message.textMessageData);
  const extended = asRecord(message.extendedTextMessageData);
  const text = stringValue(textMessage.textMessage) || stringValue(extended.text);
  const from = stringValue(sender.sender);
  if (!text || !from) return null;
  if (text.length > 8000) throw new Error("Сообщение слишком длинное.");

  const contactName = stringValue(sender.senderName) || stringValue(sender.senderContactName) || null;

  return {
    from,
    text,
    messageId: stringValue(record.idMessage) || null,
    contactName,
  };
}

async function loadWhatsAppAgent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  agentId: string,
) {
  const withChannels = await supabase
    .from("agents")
    .select("id, system_prompt, model, temperature, is_active, active_channels")
    .eq("id", agentId)
    .maybeSingle();

  if (!withChannels.error || !withChannels.error.message.includes("active_channels")) {
    return withChannels;
  }

  const fallback = await supabase
    .from("agents")
    .select("id, system_prompt, model, temperature, is_active")
    .eq("id", agentId)
    .maybeSingle();

  return {
    data: fallback.data ? { ...fallback.data, active_channels: null } : null,
    error: fallback.error,
  };
}

function whatsappChannelEnabled(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  return (value as { whatsapp?: unknown }).whatsapp !== false;
}

async function findWhatsAppChannel(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await supabase
    .from("integrations")
    .select("id, user_id, agent_id")
    .eq("provider", "whatsapp")
    .eq("status", "connected")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id || !data.user_id || !data.agent_id) {
    throw new Error("Нет активной WhatsApp-интеграции.");
  }

  return {
    integrationId: data.id as string,
    userId: data.user_id as string,
    agentId: data.agent_id as string,
  };
}

async function upsertConversation(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    userId: string;
    agentId: string;
    integrationId: string;
    externalChatId: string;
    contactName: string | null;
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

  const patch: {
    user_id: string;
    agent_id: string;
    contact_name?: string;
    last_message_preview: string;
    last_message_at: string;
  } = {
    user_id: input.userId,
    agent_id: input.agentId,
    last_message_preview: input.preview.slice(0, 140),
    last_message_at: new Date().toISOString(),
  };

  if (input.contactName) patch.contact_name = input.contactName;

  if (existing?.id) {
    const { error } = await supabase.from("conversations").update(patch).eq("id", existing.id);
    if (error) throw new Error(error.message);
    return { id: existing.id as string, botActive: await readBotActive(supabase, existing.id as string) };
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      ...patch,
      integration_id: input.integrationId,
      external_chat_id: input.externalChatId,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Не удалось создать диалог.");
  return { id: data.id as string, botActive: true };
}

async function readBotActive(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string,
) {
  const flags = await readBotFlags(supabase, [conversationId]);
  return flags.get(conversationId) ?? true;
}

function clampTemperature(value: unknown) {
  const temperature = Number(value);
  if (!Number.isFinite(temperature)) return 0.7;
  return Math.min(2, Math.max(0, temperature));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
