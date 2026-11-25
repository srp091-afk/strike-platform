import "server-only";

import { readHandoffDuration } from "@/lib/agent-models";
import { pauseBotForHandoff } from "@/lib/bot-state";
import { deliverChunk } from "@/lib/deliver";
import { sendEmailReply, type EmailConfig } from "@/lib/email-channel";
import { sendMessengerMessage } from "@/lib/messenger";
import { markAgentReplied } from "@/lib/followup";
import { getEffectiveUserId } from "@/lib/account-context";
import { isEvolutionInstance, sendConnectedWhatsApp } from "@/lib/evolution-api";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendTwilioSms } from "@/lib/twilio-sms";
import { sendViberMessage } from "@/lib/viber";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Ручной ответ оператора из раздела «Чаты». SMS уходит через Twilio агента. */
export async function sendOperatorReply(conversationId: string, text: string) {
  const body = text.trim().slice(0, 4000);
  if (!UUID_PATTERN.test(conversationId)) return { ok: false as const, error: "Диалог не найден." };
  if (!body) return { ok: false as const, error: "Введите текст ответа." };

  const userId = await getEffectiveUserId();
  if (!userId) return { ok: false as const, error: "Рабочее пространство не найдено." };

  const supabase = createSupabaseAdminClient();
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, agent_id, external_chat_id, integrations(provider)")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (conversationError) return { ok: false as const, error: conversationError.message };
  if (!conversation?.agent_id) return { ok: false as const, error: "Диалог не найден." };

  const provider = readProvider(conversation.integrations);
  const chatId = typeof conversation.external_chat_id === "string" ? conversation.external_chat_id.trim() : "";
  if (!chatId) return { ok: false as const, error: "У диалога нет адреса клиента." };
  if (provider === "widget" || provider === "unknown" || !provider) {
    return { ok: false as const, error: "Ответ из кабинета для этого канала недоступен." };
  }

  const agent = await loadAgent(String(conversation.agent_id), userId, provider);
  if (!agent.ok) return agent;

  const evolutionWa = provider === "whatsapp" && isEvolutionInstance(agent.agent.wa_instance_id ?? "");
  let placeholderId: string | null = null;
  if (evolutionWa) {
    const placeholder = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role: "assistant", content: body, status: "sent" })
      .select("id")
      .single();
    if (placeholder.error || !placeholder.data) {
      return { ok: false as const, error: "Не удалось сохранить ответ." };
    }
    placeholderId = String(placeholder.data.id);
  }

  const sent = await deliver(supabase, conversationId, provider, chatId, body, agent.agent);
  if (!sent.ok) {
    if (placeholderId) await supabase.from("messages").delete().eq("id", placeholderId);
    return sent;
  }

  const { data: stored, error: storedError } = placeholderId
    ? sent.externalId
      ? await supabase
          .from("messages")
          .update({ external_message_id: sent.externalId })
          .eq("id", placeholderId)
          .select("id")
          .single()
      : { data: { id: placeholderId }, error: null }
    : await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          role: "assistant",
          content: body,
          status: "sent",
          ...(sent.externalId ? { external_message_id: sent.externalId } : {}),
        })
        .select("id")
        .single();
  if (storedError || !stored) {
    return { ok: false as const, error: "Сообщение ушло клиенту, но не сохранилось в истории." };
  }

  await supabase
    .from("conversations")
    .update({ last_message_preview: body.slice(0, 140), last_message_at: new Date().toISOString() })
    .eq("id", conversationId);
  await pauseBotForHandoff(supabase, conversationId, readHandoffDuration(agent.agent.human_handoff_duration));
  await markAgentReplied(supabase, conversationId);
  const { retireTasksForConversation } = await import("@/lib/proactive/stale");
  await retireTasksForConversation(supabase, {
    userId,
    conversationId,
    contact: chatId,
    reason: "Менеджер ответил в диалоге — задача снята с отправки",
  });
  return { ok: true as const, messageId: String(stored.id) };
}

async function deliver(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  conversationId: string,
  provider: string,
  chatId: string,
  body: string,
  agent: OperatorAgent,
): Promise<{ ok: true; externalId: string | null } | { ok: false; error: string }> {
  try {
    if (provider === "messenger") {
      if (!agent.fb_page_access_token) return { ok: false, error: "Подключите Facebook Messenger у этого агента." };
      const sent = await sendMessengerMessage({ pageAccessToken: agent.fb_page_access_token, recipientId: chatId, text: body });
      return sent.ok ? { ok: true, externalId: null } : { ok: false, error: sent.error };
    }
    if (provider === "viber") {
      if (!agent.viber_auth_token) return { ok: false, error: "Подключите Viber у этого агента." };
      const sent = await sendViberMessage({
        authToken: agent.viber_auth_token,
        receiver: chatId,
        text: body,
        senderName: agent.viber_bot_name || "Ассистент",
      });
      return sent.ok ? { ok: true, externalId: null } : { ok: false, error: sent.error };
    }
    if (provider === "email") {
      const config = mailConfig(agent);
      if (!config) return { ok: false, error: "Подключите почту у этого агента." };
      const thread = await supabase
        .from("messages")
        .select("external_message_id")
        .eq("conversation_id", conversationId)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const messageId = messageIdOrNull(thread.data?.external_message_id);
      const sent = await sendEmailReply({
        config,
        to: chatId,
        subject: "ваше письмо",
        text: body,
        inReplyTo: messageId,
        references: messageId,
      });
      return sent.ok ? { ok: true, externalId: sent.messageId } : { ok: false, error: sent.error };
    }
    if (provider === "sms") {
      if (!agent.twilio_account_sid || !agent.twilio_auth_token || !agent.twilio_sms_number) {
        return { ok: false, error: "Подключите SMS (Twilio) у этого агента." };
      }
      const sent = await sendTwilioSms({
        accountSid: agent.twilio_account_sid,
        authToken: agent.twilio_auth_token,
        from: agent.twilio_sms_number,
        to: chatId,
        body,
      });
      return sent.ok ? { ok: true, externalId: sent.sid } : { ok: false, error: sent.error };
    }
    if (provider === "whatsapp") {
      if (!agent.wa_instance_id || !agent.wa_api_token) {
        return { ok: false, error: "Сначала подключите WhatsApp у этого агента." };
      }
      const externalId = await sendConnectedWhatsApp(agent.wa_instance_id, agent.wa_api_token, chatId, body);
      return { ok: true, externalId: externalId || null };
    }
    if (provider === "telegram") {
      if (!agent.tg_bot_token) {
        return { ok: false, error: "Ответ из кабинета доступен для Telegram-бота." };
      }
      const result = await deliverChunk({
        provider: "telegram",
        externalChatId: chatId,
        text: body,
        credentials: { botToken: agent.tg_bot_token },
      });
      return result.delivered ? { ok: true, externalId: null } : { ok: false, error: "Telegram не принял сообщение." };
    }
    if (provider === "instagram") {
      if (!agent.instagram_page_id || !agent.instagram_access_token) {
        return { ok: false, error: "Сначала подключите Instagram у этого агента." };
      }
      const result = await deliverChunk({
        provider: "instagram",
        externalChatId: chatId,
        text: body,
        credentials: { pageId: agent.instagram_page_id, accessToken: agent.instagram_access_token },
      });
      return result.delivered ? { ok: true, externalId: null } : { ok: false, error: "Instagram не принял сообщение." };
    }
  } catch (failure) {
    console.error("[operator reply]", failure instanceof Error ? failure.message : failure);
    return { ok: false, error: "Не удалось отправить ответ." };
  }
  return { ok: false, error: "Ответ из кабинета для этого канала недоступен." };
}

type OperatorAgent = {
  human_handoff_duration: unknown;
  wa_instance_id: string | null;
  wa_api_token: string | null;
  tg_bot_token: string | null;
  instagram_page_id: string | null;
  instagram_access_token: string | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_sms_number: string | null;
  viber_auth_token: string | null;
  viber_bot_name: string | null;
  email_address: string | null;
  email_password: string | null;
  email_smtp_host: string | null;
  email_smtp_port: number | null;
  fb_page_access_token: string | null;
};

async function loadAgent(agentId: string, userId: string, provider: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agents")
    .select("human_handoff_duration, wa_instance_id, wa_api_token, tg_bot_token, instagram_page_id, instagram_access_token")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false as const, error: error.message };
  if (!data) return { ok: false as const, error: "Агент не найден." };

  const agent: OperatorAgent = {
    human_handoff_duration: data.human_handoff_duration,
    wa_instance_id: textOrNull(data.wa_instance_id),
    wa_api_token: textOrNull(data.wa_api_token),
    tg_bot_token: textOrNull(data.tg_bot_token),
    instagram_page_id: textOrNull(data.instagram_page_id),
    instagram_access_token: textOrNull(data.instagram_access_token),
    twilio_account_sid: null,
    twilio_auth_token: null,
    twilio_sms_number: null,
    viber_auth_token: null,
    viber_bot_name: null,
    email_address: null,
    email_password: null,
    email_smtp_host: null,
    email_smtp_port: null,
    fb_page_access_token: null,
  };
  if (provider === "messenger") {
    const messenger = await supabase.from("agents").select("fb_page_access_token").eq("id", agentId).eq("user_id", userId).maybeSingle();
    if (messenger.error) {
      const message = /fb_page_|fb_messenger_|schema cache/i.test(messenger.error.message)
        ? "Примените миграцию 20261122_agent_messenger.sql."
        : messenger.error.message;
      return { ok: false as const, error: message };
    }
    agent.fb_page_access_token = textOrNull(messenger.data?.fb_page_access_token);
    return { ok: true as const, agent };
  }
  if (provider === "viber") {
    const viber = await supabase.from("agents").select("viber_auth_token, viber_bot_name").eq("id", agentId).eq("user_id", userId).maybeSingle();
    if (viber.error) {
      const message = /viber_|schema cache/i.test(viber.error.message) ? "Примените миграцию 20261122_agent_viber_email.sql." : viber.error.message;
      return { ok: false as const, error: message };
    }
    agent.viber_auth_token = textOrNull(viber.data?.viber_auth_token);
    agent.viber_bot_name = textOrNull(viber.data?.viber_bot_name);
    return { ok: true as const, agent };
  }
  if (provider === "email") {
    const mail = await supabase
      .from("agents")
      .select("email_address, email_password, email_smtp_host, email_smtp_port")
      .eq("id", agentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (mail.error) {
      const message = /email_|schema cache/i.test(mail.error.message) ? "Примените миграцию 20261122_agent_viber_email.sql." : mail.error.message;
      return { ok: false as const, error: message };
    }
    agent.email_address = textOrNull(mail.data?.email_address);
    agent.email_password = typeof mail.data?.email_password === "string" ? mail.data.email_password : null;
    agent.email_smtp_host = textOrNull(mail.data?.email_smtp_host);
    agent.email_smtp_port = Number(mail.data?.email_smtp_port) || 465;
    return { ok: true as const, agent };
  }
  if (provider !== "sms") return { ok: true as const, agent };

  const sms = await supabase
    .from("agents")
    .select("twilio_account_sid, twilio_auth_token, twilio_sms_number")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (sms.error) {
    const message = /twilio_sms_|twilio_account_sid|twilio_auth_token|schema cache/i.test(sms.error.message)
      ? "Примените миграцию 20261122_agent_twilio_sms.sql."
      : sms.error.message;
    return { ok: false as const, error: message };
  }
  agent.twilio_account_sid = textOrNull(sms.data?.twilio_account_sid);
  agent.twilio_auth_token = textOrNull(sms.data?.twilio_auth_token);
  agent.twilio_sms_number = textOrNull(sms.data?.twilio_sms_number);
  return { ok: true as const, agent };
}

function mailConfig(agent: OperatorAgent): EmailConfig | null {
  const email = agent.email_address?.trim().toLowerCase() ?? "";
  const password = agent.email_password ?? "";
  const smtpHost = agent.email_smtp_host?.trim() ?? "";
  if (!email || !password.trim() || !smtpHost) return null;
  return { email, password, imapHost: "localhost", imapPort: 993, smtpHost, smtpPort: agent.email_smtp_port || 465 };
}

function messageIdOrNull(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  return id.includes("@") ? id : null;
}

function readProvider(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return "";
  const provider = (row as { provider?: unknown }).provider;
  return typeof provider === "string" ? provider : "";
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
