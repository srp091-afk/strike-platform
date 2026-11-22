import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readHandoffDuration, readMessageLimit, isBotPauseActive } from "@/lib/agent-models";
import { pauseBotForHandoff, pauseIfDialogueOverLimit } from "@/lib/bot-state";
import { openChannelConversation } from "@/lib/channel-inbox";
import { completeChannelReply } from "@/lib/channel-turn";
import { markAgentReplied, markClientReplied } from "@/lib/followup";
import { getMessengerSenderName, messengerAppId, sendMessengerMessage } from "@/lib/messenger";
import { replyChunks, sleep, splitPauseMs, stripMarkdown } from "@/lib/reply";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const AGENT_COLUMNS =
  "id, user_id, name, system_prompt, model, temperature, is_active, split_messages, human_handoff_duration, limit_agent_messages, limit_client_messages, limit_total_messages, fb_messenger_enabled, fb_page_id, fb_page_access_token";

type MessengerAgent = {
  id: string;
  user_id: string;
  name: string | null;
  system_prompt: string | null;
  model: string | null;
  temperature: number | null;
  is_active: boolean | null;
  split_messages: boolean | null;
  human_handoff_duration: unknown;
  limit_agent_messages: number | null;
  limit_client_messages: number | null;
  limit_total_messages: number | null;
  fb_messenger_enabled: boolean | null;
  fb_page_id: string | null;
  fb_page_access_token: string | null;
};

type Incoming = {
  pageId: string;
  senderId: string;
  recipientId: string;
  text: string;
  messageId: string;
  echo: boolean;
  appId: string;
};

/** Разбирает объект `page` от Meta. Подпись проверяет сам роут. */
export async function processMessengerWebhook(body: unknown) {
  const events = readMessaging(body);
  for (const event of events) {
    try {
      await handleEvent(event);
    } catch (error) {
      console.error("[messenger]", error instanceof Error ? error.message : error);
    }
  }
}

async function handleEvent(event: Incoming) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("agents").select(AGENT_COLUMNS).eq("fb_page_id", event.pageId).maybeSingle();
  if (error) {
    if (/fb_page_|fb_messenger_|schema cache/i.test(error.message)) return;
    throw new Error(error.message);
  }
  const agent = data as MessengerAgent | null;
  if (!agent?.user_id) return;
  const token = (agent.fb_page_access_token ?? "").trim();
  if (!token) return;

  if (event.echo) {
    const ourApp = messengerAppId();
    if (!ourApp || event.appId === ourApp) return;
    await pauseForOperator(supabase, agent, event.recipientId, event.text, event.messageId);
    return;
  }

  if (agent.fb_messenger_enabled !== true || !event.text || !event.senderId) return;
  const senderName = await getMessengerSenderName(event.senderId, token);
  const conversation = await openChannelConversation(supabase, {
    userId: agent.user_id,
    agentId: agent.id,
    provider: "messenger",
    externalChatId: event.senderId,
    contactName: senderName,
    preview: event.text,
  });
  if (event.messageId && (await alreadyStored(supabase, conversation.id, event.messageId))) return;

  const { error: inboundError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: event.text,
    status: "sent",
    ...(event.messageId ? { external_message_id: externalId(event.messageId) } : {}),
  });
  if (inboundError) throw new Error(inboundError.message);
  await markClientReplied(supabase, conversation.id);

  if (agent.is_active !== true || !conversation.botActive) return;
  const { data: pause } = await supabase.from("conversations").select("bot_paused_until").eq("id", conversation.id).maybeSingle();
  if (isBotPauseActive(pause?.bot_paused_until)) return;
  if (
    await pauseIfDialogueOverLimit(supabase, conversation.id, {
      agent: readMessageLimit(agent.limit_agent_messages),
      client: readMessageLimit(agent.limit_client_messages),
      total: readMessageLimit(agent.limit_total_messages),
    })
  ) {
    return;
  }

  const completion = await completeChannelReply({
    supabase,
    agent,
    conversationId: conversation.id,
    channel: "messenger",
    chatId: event.senderId,
    clientName: senderName,
    question: event.text,
  });
  if (!completion.text || completion.paused) return;

  const chunks = replyChunks(completion.text, agent.split_messages);
  let preview = chunks[0] ?? completion.text;
  let replied = false;
  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) await sleep(splitPauseMs());
    const plain = stripMarkdown(chunk).trim();
    if (!plain) continue;
    const sent = await sendMessengerMessage({ pageAccessToken: token, recipientId: event.senderId, text: plain });
    const { error: storedError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: plain,
      status: sent.ok ? "sent" : "failed",
    });
    if (storedError) throw new Error(storedError.message);
    preview = plain;
    if (sent.ok) replied = true;
    if (!sent.ok) {
      console.error("[messenger] send", sent.error);
      break;
    }
  }
  await supabase
    .from("conversations")
    .update({ last_message_preview: preview.slice(0, 140), last_message_at: new Date().toISOString(), agent_id: agent.id })
    .eq("id", conversation.id);
  if (replied) await markAgentReplied(supabase, conversation.id);
}

async function pauseForOperator(supabase: SupabaseClient, agent: MessengerAgent, chatId: string, text: string, messageId: string) {
  const userId = chatId.trim();
  if (!userId) return;
  const conversation = await openChannelConversation(supabase, {
    userId: agent.user_id,
    agentId: agent.id,
    provider: "messenger",
    externalChatId: userId,
    contactName: null,
    preview: text || "Оператор ответил в Meta",
  });
  if (messageId && (await alreadyStored(supabase, conversation.id, messageId))) {
    await pauseBotForHandoff(supabase, conversation.id, readHandoffDuration(agent.human_handoff_duration));
    return;
  }
  if (text) {
    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: text,
      status: "sent",
      ...(messageId ? { external_message_id: externalId(messageId) } : {}),
    });
  }
  await pauseBotForHandoff(supabase, conversation.id, readHandoffDuration(agent.human_handoff_duration));
  await markAgentReplied(supabase, conversation.id);
}

async function alreadyStored(supabase: SupabaseClient, conversationId: string, messageId: string) {
  const existing = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("external_message_id", externalId(messageId))
    .limit(1)
    .maybeSingle();
  return Boolean(existing.data?.id);
}

function externalId(messageId: string) {
  return `ms:${messageId}`.slice(0, 180);
}

function readMessaging(body: unknown): Incoming[] {
  const root = asRecord(body);
  if (root.object !== "page") return [];
  const events: Incoming[] = [];
  for (const entryValue of Array.isArray(root.entry) ? root.entry : []) {
    const entry = asRecord(entryValue);
    const pageId = text(entry.id);
    if (!pageId) continue;
    for (const itemValue of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const item = asRecord(itemValue);
      const message = asRecord(item.message);
      const postback = asRecord(item.postback);
      const echo = message.is_echo === true;
      const rawText = text(message.text) || text(postback.title);
      const senderId = text(asRecord(item.sender).id);
      const recipientId = text(asRecord(item.recipient).id);
      const messageId = text(message.mid) || text(postback.mid);
      const appId = message.app_id == null ? "" : String(message.app_id);
      if (echo) {
        if (!recipientId) continue;
        events.push({ pageId, senderId, recipientId, text: rawText.slice(0, 8000), messageId, echo: true, appId });
        continue;
      }
      if (!rawText || !senderId) continue;
      events.push({ pageId, senderId, recipientId, text: rawText.slice(0, 8000), messageId, echo: false, appId });
    }
  }
  return events;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
