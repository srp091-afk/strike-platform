import "server-only";

import { readHandoffDuration } from "@/lib/agent-models";
import { pauseBotForHandoff } from "@/lib/bot-state";
import { deliverChunk } from "@/lib/deliver";
import { markAgentReplied } from "@/lib/followup";
import { getEffectiveUserId } from "@/lib/account-context";
import { sendGreenMessage } from "@/lib/green-api";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendTwilioSms } from "@/lib/twilio-sms";

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

  const agent = await loadAgent(String(conversation.agent_id), userId, provider === "sms");
  if (!agent.ok) return agent;

  const sent = await deliver(provider, chatId, body, agent.agent);
  if (!sent.ok) return sent;

  const { data: stored, error: storedError } = await supabase
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
  return { ok: true as const, messageId: String(stored.id) };
}

async function deliver(
  provider: string,
  chatId: string,
  body: string,
  agent: OperatorAgent,
): Promise<{ ok: true; externalId: string | null } | { ok: false; error: string }> {
  try {
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
      const externalId = await sendGreenMessage(chatId, body, {
        idInstance: agent.wa_instance_id,
        apiToken: agent.wa_api_token,
      });
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
};

async function loadAgent(agentId: string, userId: string, needsSms: boolean) {
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
  };
  if (!needsSms) return { ok: true as const, agent };

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

function readProvider(value: unknown) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return "";
  const provider = (row as { provider?: unknown }).provider;
  return typeof provider === "string" ? provider : "";
}

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
