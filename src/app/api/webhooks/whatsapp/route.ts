import type { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { normalizeAgentModel, readHandoffDuration, readMessageLimit } from "@/lib/agent-models";
import { pauseBotForHandoff, pauseIfDialogueOverLimit, readBotFlags } from "@/lib/bot-state";
import { getGreenChatHistory, sendGreenMessage, type GreenCredentials } from "@/lib/green-api";
import { completeWithNotifyManager } from "@/lib/notify-manager";
import { replyChunks, systemPromptWithSplit } from "@/lib/reply";
import { readGreenMedia, resolveWhatsAppMedia, visionModel, type VisionImage, type WhatsAppMedia } from "@/lib/whatsapp-media";

type AdminClient = SupabaseClient;

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
    console.error("[whatsapp webhook]", error);
  }

  return Response.json({ ok: true });
}

async function handleOutgoing(request: NextRequest, body: unknown) {
  const outgoing = readOutgoing(body);
  if (!outgoing) return;

  const supabase = createWebhookAdmin();
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
      userId: channel.userId,
      conversationId: conversation.id,
      role: "assistant",
      content: outgoing.text,
      status: "sent",
      externalMessageId: outgoing.messageId,
      createdAt: outgoing.sentAt,
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
  const parsed = readIncoming(body);
  if (!parsed) return;

  const supabase = createWebhookAdmin();
  const channel = await resolveWhatsAppAccount(request, body, supabase);
  if (!channel) return;

  if (parsed.messageId) {
    const { data: existing, error: duplicateError } = await supabase
      .from("messages")
      .select("id")
      .eq("external_message_id", parsed.messageId)
      .limit(1);

    if (duplicateError) throw new Error(duplicateError.message);
    if (existing && existing.length > 0) return;
  }

  let incoming = parsed;
  let image: VisionImage | null = null;
  if (parsed.media) {
    const resolved = await resolveWhatsAppMedia(parsed.media, channel.credentials);
    incoming = { ...parsed, text: resolved.text };
    image = resolved.image;
  }
  if (!incoming.text.trim()) return;

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
    await insertMessage(supabase, {
      userId: channel.userId,
      conversationId: conversation.id,
      role: "user",
      content: incoming.text,
      status: "sent",
      externalMessageId: incoming.messageId,
      createdAt: incoming.sentAt,
    });
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
    await bindConversationAgent(supabase, priorId, channel.agentId);
    await insertMessage(supabase, {
      userId: channel.userId,
      conversationId: priorId,
      role: "user",
      content: incoming.text,
      status: "sent",
      externalMessageId: incoming.messageId,
      createdAt: incoming.sentAt,
    });
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

  await insertMessage(supabase, {
    userId: channel.userId,
    conversationId,
    role: "user",
    content: incoming.text,
    status: "sent",
    externalMessageId: incoming.messageId,
    createdAt: incoming.sentAt,
  });
  if (late) return;
  await syncOpeningHistory(supabase, conversationId, channel.userId, incoming.from, channel.credentials);
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

    const configuredModel = normalizeAgentModel(agent.model);
    const model = image ? visionModel(configuredModel) : configuredModel;
    const completion = await completeWithNotifyManager({
      model,
      temperature: clampTemperature(agent.temperature),
      messages: [
        {
          role: "system",
          content: systemPromptWithSplit(
            (agent.system_prompt as string) || "You are a STRIKE agent.",
            agent.split_messages,
          ),
        },
        ...completionMessages(dialogue, image),
      ],
      chat: {
        supabase,
        conversationId,
        agentId: String(agent.id),
        channel: "whatsapp",
        clientHandle: incoming.from,
        clientName: incoming.contactName,
      },
    });

    const reply = completion.text;
    if (!reply) throw new Error("Модель вернула пустой ответ.");
    if (!completion.pausedByTool && !(await readBotActive(supabase, conversationId))) return;

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
        userId: channel.userId,
        conversationId,
        role: "assistant",
        content: chunk,
        status: delivered ? "sent" : "failed",
        externalMessageId: outboundId,
        createdAt: null,
      });
      preview = chunk;
      if (!delivered) break;
    }

    const { error: previewError } = await supabase
      .from("conversations")
      .update({
        user_id: channel.userId,
        last_message_preview: preview.slice(0, 140),
        last_message_at: new Date().toISOString(),
        agent_id: agent.id,
      })
      .eq("id", conversationId);

    if (previewError) {
      console.error("[whatsapp webhook] conversations update", previewError);
      throw new Error(previewError.message);
    }
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
  media: WhatsAppMedia | null;
};

function completionMessages(
  dialogue: { role: "user" | "assistant"; content: string }[],
  image: VisionImage | null,
) {
  return dialogue.map((message, index) => {
    const last = index === dialogue.length - 1;
    if (!image || !last || message.role !== "user") return message;
    return {
      role: "user" as const,
      content: [
        { type: "text" as const, text: message.content.trim() || "Клиент прислал изображение." },
        {
          type: "image_url" as const,
          image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
        },
      ],
    };
  });
}

async function syncOpeningHistory(
  supabase: AdminClient,
  conversationId: string,
  userId: string,
  chatId: string,
  credentials: GreenCredentials,
) {
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("role", "assistant");

  if (error) {
    console.error("[whatsapp webhook] messages count", error);
    throw new Error(error.message);
  }
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

  const clearedAt = await readContextClearedAt(supabase, conversationId);
  const outgoing = journal
    .map(readHistoryOutgoing)
    .filter((item): item is HistoryOutgoing => item !== null)
    .filter((item) => isAfterContextReset(item.sentAt, clearedAt))
    .reverse();
  const fallbackBase = Date.now() - outgoing.length * 1000;

  for (const [index, item] of outgoing.entries()) {
    await insertMessage(supabase, {
      userId,
      conversationId,
      role: "assistant",
      content: item.text,
      status: "sent",
      externalMessageId: item.messageId,
      createdAt: item.sentAt ?? new Date(fallbackBase + index * 1000).toISOString(),
    });
  }
}

async function readContextClearedAt(supabase: AdminClient, conversationId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select("context_cleared_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    if (error.message.includes("context_cleared_at")) {
      console.error("[whatsapp webhook] context_cleared_at", error.message);
      return null;
    }
    throw new Error(error.message);
  }
  return typeof data?.context_cleared_at === "string" ? data.context_cleared_at : null;
}

function isAfterContextReset(sentAt: string | null, clearedAt: string | null) {
  if (!clearedAt) return true;
  if (!sentAt) return false;
  const sent = Date.parse(sentAt);
  const cleared = Date.parse(clearedAt);
  if (!Number.isFinite(sent) || !Number.isFinite(cleared)) return false;
  return sent > cleared;
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
  supabase: AdminClient,
  messageId: string | null,
) {
  if (!messageId) return false;
  const { data, error } = await supabase
    .from("messages")
    .select("id")
    .eq("external_message_id", messageId)
    .limit(1);

  if (error) {
    console.error("[whatsapp webhook] messages lookup", error);
    throw new Error(error.message);
  }
  return Boolean(data && data.length > 0);
}

async function insertMessage(
  supabase: AdminClient,
  row: {
    userId: string;
    conversationId: string;
    role: "user" | "assistant";
    content: string;
    status: "sent" | "failed";
    externalMessageId: string | null;
    createdAt: string | null;
  },
) {
  try {
    if (!row.userId) throw new Error("У сообщения нет user_id владельца.");
    if (await messageExists(supabase, row.externalMessageId)) return;

    const payload: {
      user_id: string;
      conversation_id: string;
      role: "user" | "assistant";
      content: string;
      status: "sent" | "failed";
      external_message_id: string | null;
      created_at?: string;
    } = {
      user_id: row.userId,
      conversation_id: row.conversationId,
      role: row.role,
      content: row.content,
      status: row.status,
      external_message_id: row.externalMessageId,
    };
    if (row.createdAt) payload.created_at = row.createdAt;

    const { error } = await supabase.from("messages").insert(payload);
    if (error && error.code !== "23505") throw error;
  } catch (error) {
    console.error("[whatsapp webhook] messages insert", error);
    throw error instanceof Error ? error : new Error("Не удалось записать сообщение.");
  }
}

function readIncoming(body: unknown): ChatText | null {
  const record = asRecord(body);
  if (record.typeWebhook !== "incomingMessageReceived") return null;

  const sender = asRecord(record.senderData);
  const text = readWebhookText(record);
  const from = stringValue(sender.sender);
  const messageId = stringValue(record.idMessage) || null;
  const chatId = stringValue(sender.chatId) || from;
  const media = readGreenMedia(asRecord(record.messageData), chatId, messageId ?? "");
  if ((!text && !media) || !from) return null;
  if (text.length > 8000) throw new Error("Сообщение слишком длинное.");

  return {
    from,
    text,
    messageId,
    contactName: stringValue(sender.senderName) || stringValue(sender.senderContactName) || null,
    sentAt: readMessageTimestamp(record),
    media,
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
    media: null,
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
  supabase: AdminClient,
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
  supabase: AdminClient,
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
  supabase: AdminClient,
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
  supabase: AdminClient,
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
  supabase: AdminClient,
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
  supabase: AdminClient,
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
  supabase: AdminClient,
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
  supabase: AdminClient,
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
  supabase: AdminClient,
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

function createWebhookAdmin(): AdminClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  if (!url || !serviceRoleKey) {
    const error = new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    console.error("[whatsapp webhook]", error);
    throw error;
  }

  const role = readJwtRole(serviceRoleKey);
  if (role && role !== "service_role") {
    const error = new Error("SUPABASE_SERVICE_ROLE_KEY is not a service_role key");
    console.error("[whatsapp webhook]", error);
    throw error;
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  });
}

function readJwtRole(key: string) {
  const payload = key.split(".")[1];
  if (!payload) return "";
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { role?: unknown };
    return typeof json.role === "string" ? json.role : "";
  } catch {
    return "";
  }
}

async function resolveWhatsAppAccount(
  request: NextRequest,
  body: unknown,
  supabase: AdminClient,
) {
  const instanceId = normalizeInstanceId(readInstanceId(request, body));
  const phone = readAccountPhone(body);
  const token = readAccountToken(request, body);
  if (!instanceId && !phone && !token) {
    console.error("[whatsapp webhook] WhatsApp account was not in the payload");
    return null;
  }

  const { data, error } = await findWhatsAppAgent(supabase, { instanceId, phone, token });
  if (error) {
    console.error("[whatsapp webhook] agent lookup", error);
    throw new Error(error.message);
  }
  if (!data?.user_id) {
    console.error("[whatsapp webhook] agent owner was not found");
    return null;
  }

  const userId = String(data.user_id);
  const agentId = String(data.id);
  const resolvedInstance = normalizeInstanceId(String(data.wa_instance_id ?? "")) || instanceId;
  if (!resolvedInstance) {
    console.error("[whatsapp webhook] agent has no WhatsApp instance");
    return null;
  }

  const integration = await ensureWhatsAppIntegration(supabase, {
    userId,
    agentId,
    instanceId: resolvedInstance,
  });
  const apiToken = String(data.wa_api_token ?? "");

  return {
    integrationId: integration.id,
    userId,
    agentId,
    canReply: data.wa_is_active === true && apiToken.length > 0,
    credentials: {
      idInstance: String(data.wa_instance_id ?? resolvedInstance),
      apiToken,
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

function readAccountPhone(body: unknown) {
  const record = asRecord(body);
  const instance = asRecord(record.instanceData);
  return normalizeInstanceId(stringValue(instance.wid) || stringValue(instance.phone) || stringValue(record.wid));
}

function readAccountToken(request: NextRequest, body: unknown) {
  const record = asRecord(body);
  const instance = asRecord(record.instanceData);
  const fromQuery = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  const fromHeader = request.headers.get("x-api-token")?.trim() || request.headers.get("x-green-token")?.trim() || "";
  const fromBody =
    stringValue(instance.apiTokenInstance) || stringValue(record.apiTokenInstance) || stringValue(record.token);
  return fromQuery || fromHeader || fromBody;
}

async function findWhatsAppAgent(
  supabase: AdminClient,
  hints: { instanceId: string; phone: string; token: string },
) {
  const columns = "id, user_id, wa_instance_id, wa_api_token, wa_phone_number, wa_is_active";

  if (hints.instanceId) {
    const exact = await supabase.from("agents").select(columns).eq("wa_instance_id", hints.instanceId).limit(1);
    if (exact.error) return { data: null, error: exact.error };
    const row = exact.data?.[0];
    if (row?.user_id) return { data: row, error: null };
  }

  if (hints.token) {
    const byToken = await supabase.from("agents").select(columns).eq("wa_api_token", hints.token).limit(1);
    if (byToken.error) return { data: null, error: byToken.error };
    const row = byToken.data?.[0];
    if (row?.user_id) return { data: row, error: null };
  }

  const listed = await supabase
    .from("agents")
    .select(columns)
    .or("wa_api_token.not.is.null,wa_phone_number.not.is.null,wa_instance_id.not.is.null");
  if (listed.error) return { data: null, error: listed.error };
  const match = (listed.data ?? []).find((agent) => {
    const instance = normalizeInstanceId(String(agent.wa_instance_id ?? ""));
    const phone = normalizeInstanceId(String(agent.wa_phone_number ?? ""));
    const token = String(agent.wa_api_token ?? "");
    if (hints.instanceId && instance === hints.instanceId) return true;
    if (hints.token && token === hints.token) return true;
    if (hints.phone && phone === hints.phone) return true;
    return false;
  });
  return { data: match ?? null, error: null };
}

function normalizeInstanceId(value: string) {
  return value.replace(/\D/g, "");
}

async function bindConversationAgent(
  supabase: AdminClient,
  conversationId: string,
  agentId: string,
) {
  const { error } = await supabase.from("conversations").update({ agent_id: agentId }).eq("id", conversationId);
  if (error) {
    console.error("[whatsapp webhook] conversations update", error);
    throw new Error(error.message);
  }
}

async function ensureWhatsAppIntegration(
  supabase: AdminClient,
  input: { userId: string; agentId: string | null; instanceId: string },
) {
  const instanceId = normalizeInstanceId(input.instanceId);
  const { data: existing, error: lookupError } = await supabase
    .from("integrations")
    .select("id")
    .eq("provider", "whatsapp")
    .eq("external_id", instanceId)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error("[whatsapp webhook] integrations lookup", lookupError);
    throw new Error(lookupError.message);
  }
  if (existing?.id) {
    const { error } = await supabase
      .from("integrations")
      .update({ agent_id: input.agentId, user_id: input.userId, status: "connected", external_id: instanceId })
      .eq("id", existing.id);
    if (error) {
      console.error("[whatsapp webhook] integrations update", error);
      throw new Error(error.message);
    }
    return { id: existing.id as string };
  }

  if (input.agentId) {
    const owned = await supabase
      .from("integrations")
      .select("id, external_id")
      .eq("provider", "whatsapp")
      .eq("agent_id", input.agentId);
    if (owned.error) {
      console.error("[whatsapp webhook] integrations lookup", owned.error);
      throw new Error(owned.error.message);
    }
    const reusable = (owned.data ?? []).find(
      (row) => !row.external_id || normalizeInstanceId(String(row.external_id)) === instanceId,
    );
    if (reusable?.id) {
      const { error } = await supabase
        .from("integrations")
        .update({ agent_id: input.agentId, user_id: input.userId, status: "connected", external_id: instanceId })
        .eq("id", reusable.id);
      if (error) {
        console.error("[whatsapp webhook] integrations update", error);
        throw new Error(error.message);
      }
      return { id: reusable.id as string };
    }
  }

  const { data, error } = await supabase
    .from("integrations")
    .insert({
      user_id: input.userId,
      agent_id: input.agentId,
      provider: "whatsapp",
      name: "WhatsApp Business",
      status: "connected",
      external_id: instanceId,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[whatsapp webhook] integrations insert", error);
    throw new Error(error?.message ?? "Не удалось привязать номер.");
  }
  return { id: data.id as string };
}

async function upsertConversation(
  supabase: AdminClient,
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
  try {
    if (!input.userId) throw new Error("У диалога нет user_id владельца.");

    const { data: existing, error: lookupError } = await supabase
      .from("conversations")
      .select("id")
      .eq("integration_id", input.integrationId)
      .eq("external_chat_id", input.externalChatId)
      .maybeSingle();

    if (lookupError) throw lookupError;

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
      if (error) throw error;
      return { id: existing.id as string, botActive: await readBotActive(supabase, existing.id as string) };
    }

    const { data, error } = await supabase
      .from("conversations")
      .upsert(
        {
          ...patch,
          integration_id: input.integrationId,
          external_chat_id: input.externalChatId,
        },
        { onConflict: "integration_id,external_chat_id" },
      )
      .select("id")
      .single();

    if (error) throw error;
    if (!data) throw new Error("Не удалось создать диалог.");
    return { id: data.id as string, botActive: true };
  } catch (error) {
    console.error("[whatsapp webhook] conversations upsert", error);
    throw error instanceof Error ? error : new Error("Не удалось записать диалог.");
  }
}

async function readBotActive(
  supabase: AdminClient,
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
