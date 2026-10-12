import type { NextRequest } from "next/server";

import { readHandoffDuration, readMessageLimit } from "@/lib/agent-models";
import { pauseBotForHandoff, pauseIfDialogueOverLimit, readBotFlags } from "@/lib/bot-state";
import { getGreenChatHistory, sendGreenMessage, type GreenCredentials } from "@/lib/green-api";
import { getOpenAI } from "@/lib/openai";
import { replyChunks, systemPromptWithSplit } from "@/lib/reply";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 180;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const type = stringValue(asRecord(body).typeWebhook);
    if (type === "incomingMessageReceived") {
      await handleIncoming(request, body);
    } else if (readOutgoing(body)) {
      await handleOutgoing(request, body);
    }
  } catch (error) {
    console.error("[whatsapp webhook]", error instanceof Error ? error.message : error);
  }

  return Response.json({ ok: true });
}

async function handleOutgoing(request: NextRequest, body: unknown) {
  const outgoing = readOutgoing(body);
  if (!outgoing) return;

  const supabase = createSupabaseAdminClient();
  const duplicate = outgoing.messageId ? await messageExists(supabase, outgoing.messageId) : false;
  const channel = await resolveWhatsAppAccount(request, body, supabase);
  if (!channel) return;

  let conversationId: string | null = null;
  if (!duplicate && outgoing.text) {
    const conversation = await upsertConversation(supabase, {
      userId: channel.userId,
      agentId: channel.agentId,
      integrationId: channel.integrationId,
      externalChatId: outgoing.from,
      contactName: outgoing.contactName,
      preview: outgoing.text,
    });
    conversationId = conversation.id;
    await insertMessage(supabase, {
      conversation_id: conversation.id,
      role: "assistant",
      content: outgoing.text,
      status: "sent",
      external_message_id: outgoing.messageId,
      created_at: outgoing.sentAt,
    });
  } else {
    conversationId = await findConversationId(supabase, channel.integrationId, outgoing.from);
  }

  if (!outgoing.operator) return;
  if (!conversationId) {
    const conversation = await upsertConversation(supabase, {
      userId: channel.userId,
      agentId: channel.agentId,
      integrationId: channel.integrationId,
      externalChatId: outgoing.from,
      contactName: outgoing.contactName,
      preview: outgoing.text || "Сообщение оператора",
      touchPreview: Boolean(outgoing.text),
    });
    conversationId = conversation.id;
  }

  await pauseBotForHandoff(supabase, conversationId, await readAgentHandoffDuration(supabase, channel.agentId));
}

async function handleIncoming(request: NextRequest, body: unknown) {
  const incoming = readIncoming(body);
  if (!incoming) return;

  const supabase = createSupabaseAdminClient();
  const channel = await resolveWhatsAppAccount(request, body, supabase);
  if (!channel) return;

  if (incoming.messageId) {
    const { data: existing, error: duplicateError } = await supabase
      .from("messages")
      .select("id")
      .eq("external_message_id", incoming.messageId)
      .limit(1);

    if (duplicateError) throw new Error(duplicateError.message);
    if (existing && existing.length > 0) return;
  }

  if (!channel.canReply) {
    console.log("Остановка: ответы WhatsApp выключены");
    const conversation = await upsertConversation(supabase, {
      userId: channel.userId,
      agentId: channel.agentId,
      integrationId: channel.integrationId,
      externalChatId: incoming.from,
      contactName: incoming.contactName,
      preview: incoming.text,
    });
    const stored = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: incoming.text,
      status: "sent",
      external_message_id: incoming.messageId,
      ...(incoming.sentAt ? { created_at: incoming.sentAt } : {}),
    });
    const storedError = stored.error;
    if (storedError) throw new Error(storedError.message);
    return;
  }

  const { data: agent, error: agentError } = await loadWhatsAppAgent(supabase, channel.agentId);

  if (agentError) throw new Error(agentError.message);
  if (!agent || !agent.is_active) {
    throw new Error("Агент не найден или выключен.");
  }

  const priorId = await findConversationId(supabase, channel.integrationId, incoming.from);
  if (priorId && (await processingLockIsFresh(supabase, priorId))) {
    console.log("Остановка: is_processing = true");
    const { error: queuedError } = await supabase.from("messages").insert({
      conversation_id: priorId,
      role: "user",
      content: incoming.text,
      status: "sent",
      external_message_id: incoming.messageId,
      ...(incoming.sentAt ? { created_at: incoming.sentAt } : {}),
    });
    if (queuedError) throw new Error(queuedError.message);
    return;
  }

  const assistantAt = priorId ? await latestAssistantAt(supabase, priorId) : null;
  const late = isLateClientMessage(incoming.sentAt, assistantAt);

  const conversation = await upsertConversation(supabase, {
    userId: channel.userId,
    agentId: agent.id as string,
    integrationId: channel.integrationId,
    externalChatId: incoming.from,
    contactName: incoming.contactName,
    preview: incoming.text,
    touchPreview: !late,
  });
  const conversationId = conversation.id;

  const { error: inboundError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: incoming.text,
    status: "sent",
    external_message_id: incoming.messageId,
    ...(incoming.sentAt ? { created_at: incoming.sentAt } : {}),
  });

  if (inboundError) throw new Error(inboundError.message);
  if (late) return;
  await syncOpeningHistory(supabase, conversationId, incoming.from, channel.credentials);
  if (!conversation.botActive) {
    await logChatPause(supabase, conversationId);
    return;
  }
  if (!whatsappChannelEnabled(agent.active_channels)) return;

  const locked = await acquireProcessingLock(supabase, conversationId);
  if (!locked) {
    console.log("Остановка: is_processing = true");
    return;
  }

  try {
    await new Promise((resolve) => setTimeout(resolve, readDebounceMs(agent.response_delay)));
    if (!(await readBotActive(supabase, conversationId))) {
      await logChatPause(supabase, conversationId);
      return;
    }
    if (await dialogueOverLimit(supabase, conversationId, agent)) {
      console.log("Остановка: превышен лимит сообщений");
      return;
    }

    const { data: history, error: historyError } = await supabase
      .from("messages")
      .select("role, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(40);

    if (historyError) throw new Error(historyError.message);

    const dialogue = collapseTrailingUserMessages(history ?? []);
    const latest = dialogue[dialogue.length - 1];
    if (!latest || latest.role !== "user" || !latest.content.trim()) return;

    const model = (agent.model as string) || "gpt-4o-mini";
    const completion = await getOpenAI().chat.completions.create({
      model,
      temperature: model.includes("gpt-6") ? 1 : clampTemperature(agent.temperature),
      messages: [
        {
          role: "system",
          content: systemPromptWithSplit(
            (agent.system_prompt as string) || "You are a STRIKE agent.",
            agent.split_messages,
          ),
        },
        ...dialogue,
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!reply) throw new Error("Модель вернула пустой ответ.");
    if (!(await readBotActive(supabase, conversationId))) return;

    const responseDelay = Number(agent.response_delay);
    const chunks = replyChunks(reply, agent.split_messages);
    if (chunks.length === 0) throw new Error("Модель вернула пустой ответ.");

    let preview = chunks[0];
    for (const chunk of chunks) {
      let delivered = false;
      let outboundId: string | null = null;
      try {
        if (responseDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, responseDelay * 1000));
        }
        outboundId = await sendGreenMessage(incoming.from, chunk, channel.credentials);
        delivered = true;
      } catch (error) {
        console.error("[whatsapp webhook] green", error instanceof Error ? error.message : error);
      }

      await insertMessage(supabase, {
        conversation_id: conversationId,
        role: "assistant",
        content: chunk,
        status: delivered ? "sent" : "failed",
        external_message_id: outboundId,
        created_at: null,
      });
      preview = chunk;
      if (!delivered) break;
    }

    const { error: previewError } = await supabase
      .from("conversations")
      .update({
        last_message_preview: preview.slice(0, 140),
        last_message_at: new Date().toISOString(),
        agent_id: agent.id,
      })
      .eq("id", conversationId);

    if (previewError) throw new Error(previewError.message);
  } finally {
    await releaseProcessingLock(supabase, conversationId);
  }
}

type ChatText = {
  from: string;
  text: string;
  messageId: string | null;
  contactName: string | null;
  sentAt: string | null;
};

async function syncOpeningHistory(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string,
  chatId: string,
  credentials: GreenCredentials,
) {
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "assistant");

  if (error) throw new Error(error.message);
  if ((count ?? 0) > 0) return;

  let journal: unknown[] = [];
  try {
    journal = await getGreenChatHistory(chatId, 10, credentials);
  } catch (historyError) {
    console.error(
      "[whatsapp webhook] history",
      historyError instanceof Error ? historyError.message : historyError,
    );
    return;
  }

  const outgoing = journal
    .map(readHistoryOutgoing)
    .filter((item): item is HistoryOutgoing => item !== null)
    .reverse();
  const fallbackBase = Date.now() - outgoing.length * 1000;

  for (const [index, item] of outgoing.entries()) {
    await insertMessage(supabase, {
      conversation_id: conversationId,
      role: "assistant",
      content: item.text,
      status: "sent",
      external_message_id: item.messageId,
      created_at: item.sentAt ?? new Date(fallbackBase + index * 1000).toISOString(),
    });
  }
}

type HistoryOutgoing = {
  messageId: string | null;
  text: string;
  sentAt: string | null;
};

function readHistoryOutgoing(value: unknown): HistoryOutgoing | null {
  const record = asRecord(value);
  if (record.type !== "outgoing" || record.isDeleted === true) return null;

  const extended = asRecord(record.extendedTextMessage);
  const text = (stringValue(record.textMessage) || stringValue(extended.text)).slice(0, 8000);
  if (!text) return null;

  return {
    messageId: stringValue(record.idMessage) || null,
    text,
    sentAt: timestampToIso(record.timestamp),
  };
}

async function messageExists(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  messageId: string | null,
) {
  if (!messageId) return false;
  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("external_message_id", messageId)
    .limit(1);

  if (error) throw new Error(error.message);
  return Boolean(data && data.length > 0);
}

async function insertMessage(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: {
    conversation_id: string;
    role: "assistant";
    content: string;
    status: "sent" | "failed";
    external_message_id: string | null;
    created_at: string | null;
  },
) {
  if (await messageExists(supabase, row.external_message_id)) return;

  const payload: {
    conversation_id: string;
    role: "assistant";
    content: string;
    status: "sent" | "failed";
    external_message_id: string | null;
    created_at?: string;
  } = {
    conversation_id: row.conversation_id,
    role: row.role,
    content: row.content,
    status: row.status,
    external_message_id: row.external_message_id,
  };
  if (row.created_at) payload.created_at = row.created_at;

  const { error } = await supabase.from("messages").insert(payload);
  if (error && error.code !== "23505") throw new Error(error.message);
}

function readIncoming(body: unknown): ChatText | null {
  const record = asRecord(body);
  if (record.typeWebhook !== "incomingMessageReceived") return null;

  const sender = asRecord(record.senderData);
  const text = readWebhookText(record);
  const from = stringValue(sender.sender);
  if (!text || !from) return null;
  if (text.length > 8000) throw new Error("Сообщение слишком длинное.");

  return {
    from,
    text,
    messageId: stringValue(record.idMessage) || null,
    contactName: stringValue(sender.senderName) || stringValue(sender.senderContactName) || null,
    sentAt: readMessageTimestamp(record),
  };
}

function readOutgoing(body: unknown): (ChatText & { operator: boolean }) | null {
  const record = asRecord(body);
  const type = stringValue(record.typeWebhook);
  if (type.toLowerCase().includes("status")) return null;

  const kind = stringValue(record.type).toLowerCase();
  const apiEcho = type === "outgoingAPIMessageReceived" || record.sendByApi === true;
  const message = asRecord(record.messageData);
  const hasMessage = Boolean(readWebhookText(record)) || Boolean(stringValue(message.typeMessage));
  const operator =
    type === "outgoingMessageReceived" ||
    (!apiEcho && hasMessage && (record.fromMe === true || kind === "outgoing"));
  if (!apiEcho && !operator) return null;

  const sender = asRecord(record.senderData);
  const text = readWebhookText(record).slice(0, 8000);
  const from = stringValue(sender.chatId) || stringValue(record.chatId) || stringValue(sender.sender);
  if (!from || (!text && !operator)) return null;

  return {
    from,
    text,
    messageId: stringValue(record.idMessage) || null,
    contactName: stringValue(sender.chatName) || stringValue(sender.senderName) || null,
    sentAt: readMessageTimestamp(record),
    operator,
  };
}

function readMessageTimestamp(record: Record<string, unknown>) {
  const message = asRecord(record.messageData);
  return (
    timestampToIso(record.timestamp) ||
    timestampToIso(record.time) ||
    timestampToIso(message.timestamp) ||
    timestampToIso(message.time)
  );
}

function isLateClientMessage(sentAt: string | null, assistantAt: string | null) {
  if (!sentAt || !assistantAt) return false;
  const writtenAt = Date.parse(sentAt);
  const repliedAt = Date.parse(assistantAt);
  if (!Number.isFinite(writtenAt) || !Number.isFinite(repliedAt)) return false;
  return writtenAt < repliedAt;
}

async function findConversationId(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  integrationId: string,
  externalChatId: string,
) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("integration_id", integrationId)
    .eq("external_chat_id", externalChatId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.id ? String(data.id) : null;
}

async function latestAssistantAt(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string,
) {
  const { data, error } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.created_at ? String(data.created_at) : null;
}

function readWebhookText(record: Record<string, unknown>) {
  const message = asRecord(record.messageData);
  const textMessage = asRecord(message.textMessageData);
  const extended = asRecord(message.extendedTextMessageData);
  return stringValue(textMessage.textMessage) || stringValue(extended.text);
}

function timestampToIso(value: unknown) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const millis = timestamp > 1e12 ? timestamp : timestamp * 1000;
  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function dialogueOverLimit(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string,
  agent: {
    limit_agent_messages?: unknown;
    limit_client_messages?: unknown;
    limit_total_messages?: unknown;
  },
) {
  return pauseIfDialogueOverLimit(supabase, conversationId, {
    agent: readMessageLimit(agent.limit_agent_messages),
    client: readMessageLimit(agent.limit_client_messages),
    total: readMessageLimit(agent.limit_total_messages),
  });
}

async function readAgentHandoffDuration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  agentId: string,
) {
  const { data, error } = await supabase
    .from("agents")
    .select("human_handoff_duration")
    .eq("id", agentId)
    .maybeSingle();
  if (error) {
    const missing =
      error.message.includes("human_handoff_duration") &&
      (error.message.includes("does not exist") || error.message.includes("schema cache"));
    if (missing) return readHandoffDuration(null);
    throw new Error(error.message);
  }
  return readHandoffDuration(data?.human_handoff_duration);
}

async function loadWhatsAppAgent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  agentId: string,
) {
  const withChannels = await supabase
    .from("agents")
    .select("id, system_prompt, model, temperature, is_active, active_channels, response_delay, split_messages, limit_agent_messages, limit_client_messages, limit_total_messages")
    .eq("id", agentId)
    .maybeSingle();

  if (
    !withChannels.error ||
    (!withChannels.error.message.includes("split_messages") &&
      !withChannels.error.message.includes("limit_agent_messages"))
  ) {
    return withChannels;
  }

  const fallback = await supabase
    .from("agents")
    .select("id, system_prompt, model, temperature, is_active, active_channels, response_delay")
    .eq("id", agentId)
    .maybeSingle();

  return {
    data: fallback.data
      ? {
          ...fallback.data,
          split_messages: false,
          limit_agent_messages: 0,
          limit_client_messages: 0,
          limit_total_messages: 0,
        }
      : null,
    error: fallback.error,
  };
}

async function processingLockIsFresh(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string,
) {
  const current = await supabase
    .from("conversations")
    .select("is_processing, updated_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);
  if (current.data?.is_processing !== true) return false;

  const updatedAt = Date.parse(String(current.data.updated_at ?? ""));
  const fresh = Number.isFinite(updatedAt) && Date.now() - updatedAt <= 3 * 60 * 1000;
  if (fresh) return true;

  await releaseProcessingLock(supabase, conversationId);
  return false;
}

async function logChatPause(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string,
) {
  const { data } = await supabase
    .from("conversations")
    .select("bot_paused_until")
    .eq("id", conversationId)
    .maybeSingle();
  const until = data?.bot_paused_until ? String(data.bot_paused_until) : "неизвестно";
  console.log(`Остановка: чат на паузе до ${until}`);
}

async function acquireProcessingLock(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string,
) {
  const claimed = await supabase
    .from("conversations")
    .update({ is_processing: true })
    .eq("id", conversationId)
    .eq("is_processing", false)
    .select("id");

  if (claimed.error) throw new Error(claimed.error.message);
  if (claimed.data && claimed.data.length > 0) return true;

  const current = await supabase
    .from("conversations")
    .select("is_processing, updated_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (current.error) throw new Error(current.error.message);

  const updatedAt = current.data?.updated_at ? Date.parse(String(current.data.updated_at)) : 0;
  const stale = current.data?.is_processing === true && Date.now() - updatedAt > 3 * 60 * 1000;
  if (!stale) return false;

  await supabase.from("conversations").update({ is_processing: false }).eq("id", conversationId);
  const retry = await supabase
    .from("conversations")
    .update({ is_processing: true })
    .eq("id", conversationId)
    .eq("is_processing", false)
    .select("id");
  if (retry.error) throw new Error(retry.error.message);
  return Boolean(retry.data && retry.data.length > 0);
}

async function releaseProcessingLock(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string,
) {
  const { error } = await supabase
    .from("conversations")
    .update({ is_processing: false })
    .eq("id", conversationId);
  if (error) console.error("[whatsapp webhook] unlock", error.message);
}

function readDebounceMs(value: unknown) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return 8000;
  return seconds * 1000;
}

function collapseTrailingUserMessages(history: { role?: string; content?: string }[]) {
  const dialogue = [...history]
    .reverse()
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: String(message.content ?? ""),
    }));

  let splitAt = dialogue.length;
  while (splitAt > 0 && dialogue[splitAt - 1]?.role === "user") splitAt -= 1;

  const burst = dialogue
    .slice(splitAt)
    .map((message) => message.content.trim())
    .filter((content) => content !== "");
  if (burst.length === 0) return dialogue;

  return [...dialogue.slice(0, splitAt), { role: "user" as const, content: burst.join("\n") }];
}

function whatsappChannelEnabled(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return true;
  return (value as { whatsapp?: unknown }).whatsapp !== false;
}

async function resolveWhatsAppAccount(
  request: NextRequest,
  body: unknown,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const instanceId = readInstanceId(request, body);
  if (!instanceId) return null;

  const { data, error } = await supabase
    .from("agents")
    .select("id, user_id, wa_instance_id, wa_api_token, wa_is_active")
    .eq("wa_instance_id", instanceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.user_id || !data.wa_api_token) return null;

  const agentId = String(data.id);
  const userId = String(data.user_id);
  const integration = await ensureWhatsAppIntegration(supabase, {
    userId,
    agentId,
    instanceId,
  });

  return {
    integrationId: integration.id,
    userId,
    agentId,
    canReply: data.wa_is_active === true,
    credentials: {
      idInstance: String(data.wa_instance_id),
      apiToken: String(data.wa_api_token),
    } satisfies GreenCredentials,
  };
}

function readInstanceId(request: NextRequest, body: unknown) {
  const record = asRecord(body);
  const instance = asRecord(record.instanceData);
  const fromBody = stringValue(instance.idInstance) || stringValue(record.idInstance);
  if (fromBody) return fromBody;
  return request.headers.get("x-id-instance")?.trim() || request.headers.get("id-instance")?.trim() || "";
}

async function ensureWhatsAppIntegration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: { userId: string; agentId: string | null; instanceId: string },
) {
  const { data: existing, error: lookupError } = await supabase
    .from("integrations")
    .select("id")
    .eq("provider", "whatsapp")
    .eq("external_id", input.instanceId)
    .limit(1)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  if (existing?.id) {
    await supabase
      .from("integrations")
      .update({ agent_id: input.agentId, status: "connected" })
      .eq("id", existing.id);
    return { id: existing.id as string };
  }

  const { data, error } = await supabase
    .from("integrations")
    .insert({
      user_id: input.userId,
      agent_id: input.agentId,
      provider: "whatsapp",
      name: "WhatsApp Business",
      status: "connected",
      external_id: input.instanceId,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Не удалось привязать номер.");
  return { id: data.id as string };
}

async function upsertConversation(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    userId: string;
    agentId: string | null;
    integrationId: string;
    externalChatId: string;
    contactName: string | null;
    preview: string;
    touchPreview?: boolean;
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
    agent_id: string | null;
    contact_name?: string;
    last_message_preview?: string;
    last_message_at?: string;
  } = {
    user_id: input.userId,
    agent_id: input.agentId,
  };
  if (input.touchPreview !== false) {
    patch.last_message_preview = input.preview.slice(0, 140);
    patch.last_message_at = new Date().toISOString();
  }

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
