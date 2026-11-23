import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readBotFlags } from "@/lib/bot-state";
import { readFollowupInterval, readFollowupMaxCount } from "@/lib/agent-models";
import { sendEmailReply, type EmailConfig } from "@/lib/email-channel";
import { isEvolutionInstance, sendConnectedWhatsApp } from "@/lib/evolution-api";
import { getOpenAI } from "@/lib/openai";
import { sleep, stripMarkdown } from "@/lib/reply";
import { sendTwilioSms } from "@/lib/twilio-sms";
import { sendMessengerMessage } from "@/lib/messenger";
import { sendViberMessage } from "@/lib/viber";

/** Случайная пауза перед отправкой пуша: 3–12 с, чтобы пачка уведомлений не уходила в одну миллисекунду. */
const SEND_JITTER_MIN_MS = 3000;
const SEND_JITTER_MAX_MS = 12000;
/** Бюджет одного прогона. Функция живёт до 60 с (maxDuration), оставляем запас; остальное доберёт следующий запуск. */
const RUN_BUDGET_MS = 45_000;

/** Модель-«контролёр»: json_object поддерживают gpt-4o-семейства, ответ короткий, но mini делал грамматические ошибки («не забыла ли вы»), поэтому полноценная gpt-4o. */
const GATEKEEPER_MODEL = "gpt-4o";
const HISTORY_LIMIT = 10;
const MAX_CONVERSATIONS_PER_RUN = 100;
const TEMPLATE_PLACEHOLDER = "[ВСТАВИТЬ_ШАБЛОН_ЕСЛИ_ЕСТЬ]";

const GATEKEEPER_PROMPT = `Ты — AI-контролер качества продаж. Проанализируй историю диалога. Твоя задача — решить, уместно ли сейчас отправить клиенту напоминание (follow-up).

ПРАВИЛА ОТМЕНЫ ПУША (верни { "action": "stop", "message": null }):
1. Клиент прямо или косвенно отказался (сказал 'Нет', 'Не интересно', 'Дорого', 'Не пишите').
2. Диалог логически завершен, и агент НЕ задавал вопроса в конце.
3. Агент пообещал выполнить действие вне чата (например: 'Я пойду запишу видео', 'Подготовлю договор', 'Передам менеджеру', 'Свяжемся с вами позже'). В этом случае клиент ждет действия от нас, пуш отправлять КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО.

ПРАВИЛА ОТПРАВКИ ПУША (верни { "action": "push", "message": "текст" }):
1. В последнем сообщении агент задал вопрос, призывающий к диалогу, а клиент его проигнорировал.
2. Если передан шаблон/инструкция ${TEMPLATE_PLACEHOLDER}, используй его смысл для формирования текста, адаптировав под контекст (без markdown).
3. Если шаблона нет, сгенерируй короткое, живое и вежливое сообщение-напоминание (максимум 2 предложения). Напомни суть последнего вопроса.

Ответ — строго JSON-объект вида {"action": "stop" | "push", "message": string | null}. CRITICAL RULE: YOU MUST WRITE THE FOLLOW-UP MESSAGE IN THE EXACT SAME LANGUAGE THAT THE CLIENT USED IN THEIR LAST MESSAGES. IGNORE THE LANGUAGE OF THE SYSTEM PROMPTS OR THE VERY FIRST AUTOMATED GREETINGS. IF THE CLIENT SPEAKS ENGLISH, THE FOLLOW-UP MUST BE IN ENGLISH. IF TURKISH, IN TURKISH. IF RUSSIAN, IN RUSSIAN.

ГРАММАТИКА (КРИТИЧНО): текст должен быть безупречно грамотным, как у образованного носителя языка. Для русского: при обращении на «вы» глагол ВСЕГДА во множественном числе, даже если клиент — одна женщина или один мужчина. Правильно: «Елена, вы не забыли про мой вопрос?», «не забыли ли вы». НЕПРАВИЛЬНО: «не забыла ли вы», «вы забыла», «вы смог». Избегай конструкций, где нужно угадывать род клиента. Перед ответом перечитай сообщение и исправь любые ошибки согласования, падежей и канцеляризмы.

Пиши простым текстом без markdown.`;

type AdminClient = SupabaseClient;

/** Агент только что ответил клиенту: ждём реакции, счётчик напоминаний начинается заново. Не роняет вебхук. */
export async function markAgentReplied(supabase: AdminClient, conversationId: string) {
  const { error } = await supabase
    .from("conversations")
    .update({ last_agent_message_at: new Date().toISOString(), push_count: 0, is_waiting_for_user: true })
    .eq("id", conversationId);
  if (error) console.error("[followup] markAgentReplied", error.message);
}

/** Клиент написал сам — ждать от него больше нечего. Не роняет вебхук. */
export async function markClientReplied(supabase: AdminClient, conversationId: string) {
  const { error } = await supabase
    .from("conversations")
    .update({ is_waiting_for_user: false })
    .eq("id", conversationId);
  if (error) console.error("[followup] markClientReplied", error.message);
}

type FollowupAgent = {
  id: string;
  is_active: boolean | null;
  followup_interval_hours: unknown;
  followup_max_count: unknown;
  followup_template: string | null;
  system_prompt: string | null;
  wa_instance_id: string | null;
  wa_api_token: string | null;
  wa_is_active: boolean | null;
  tg_bot_token: string | null;
  tg_is_active: boolean | null;
  active_channels: unknown;
  twilio_sms_enabled?: boolean | null;
  twilio_account_sid?: string | null;
  twilio_auth_token?: string | null;
  twilio_sms_number?: string | null;
  viber_enabled?: boolean | null;
  viber_auth_token?: string | null;
  viber_bot_name?: string | null;
  email_enabled?: boolean | null;
  email_address?: string | null;
  email_password?: string | null;
  email_smtp_host?: string | null;
  email_smtp_port?: number | null;
  fb_messenger_enabled?: boolean | null;
  fb_page_access_token?: string | null;
};

type FollowupConversation = {
  id: string;
  user_id: string;
  agent_id: string;
  external_chat_id: string;
  push_count: number | null;
  integration: { provider: string } | { provider: string }[] | null;
};

export type FollowupSummary = {
  scanned: number;
  pushed: number;
  stopped: number;
  skipped: number;
  failed: number;
};

/** Один прогон планировщика: найти «молчащие» диалоги, спросить контролёра, отправить пуш или снять ожидание. */
export async function runFollowups(supabase: AdminClient): Promise<FollowupSummary> {
  const summary: FollowupSummary = { scanned: 0, pushed: 0, stopped: 0, skipped: 0, failed: 0 };

  const baseColumns =
    "id, is_active, followup_interval_hours, followup_max_count, followup_template, system_prompt, wa_instance_id, wa_api_token, wa_is_active, tg_bot_token, tg_is_active, active_channels";
  const smsColumns = "twilio_sms_enabled, twilio_account_sid, twilio_auth_token, twilio_sms_number";
  const mailColumns =
    "viber_enabled, viber_auth_token, viber_bot_name, email_enabled, email_address, email_password, email_smtp_host, email_smtp_port";
  const messengerColumns = "fb_messenger_enabled, fb_page_access_token";
  const withMessenger = await supabase
    .from("agents")
    .select(`${baseColumns}, ${smsColumns}, ${mailColumns}, ${messengerColumns}`)
    .eq("followup_enabled", true);
  const withChannels =
    withMessenger.error && /fb_messenger_|fb_page_|schema cache/i.test(withMessenger.error.message)
      ? await supabase.from("agents").select(`${baseColumns}, ${smsColumns}, ${mailColumns}`).eq("followup_enabled", true)
      : withMessenger;
  const channelMissing =
    withChannels.error && /viber_|email_enabled|email_address|email_password|email_smtp|schema cache/i.test(withChannels.error.message);
  const withSms = channelMissing
    ? await supabase.from("agents").select(`${baseColumns}, ${smsColumns}`).eq("followup_enabled", true)
    : withChannels;
  const agentsResult =
    withSms.error && /twilio_sms_|twilio_account_sid|twilio_auth_token|schema cache/i.test(withSms.error.message)
      ? await supabase.from("agents").select(baseColumns).eq("followup_enabled", true)
      : withSms;
  if (agentsResult.error) throw new Error(agentsResult.error.message);
  const agents = agentsResult.data;

  const deadline = Date.now() + RUN_BUDGET_MS;
  let budget = MAX_CONVERSATIONS_PER_RUN;
  for (const agent of (agents ?? []) as FollowupAgent[]) {
    if (budget <= 0 || Date.now() >= deadline) break;
    if (agent.is_active === false) continue;

    const maxCount = readFollowupMaxCount(agent.followup_max_count);
    if (maxCount <= 0) continue;
    const cutoff = new Date(Date.now() - readFollowupInterval(agent.followup_interval_hours) * 3_600_000);

    const { data: due, error: dueError } = await supabase
      .from("conversations")
      .select("id, user_id, agent_id, external_chat_id, push_count, integration:integrations(provider)")
      .eq("agent_id", agent.id)
      .eq("is_waiting_for_user", true)
      .eq("is_processing", false)
      .lt("push_count", maxCount)
      .lte("last_agent_message_at", cutoff.toISOString())
      .order("last_agent_message_at", { ascending: true })
      .limit(budget);
    if (dueError) {
      console.error("[followup] select", dueError.message);
      continue;
    }

    const conversations = (due ?? []) as unknown as FollowupConversation[];
    // Оператор подхватил диалог (пауза бота) — пуши не шлём, но ожидание не снимаем.
    const botFlags = await readBotFlags(supabase, conversations.map((item) => item.id));

    for (const conversation of conversations) {
      // Время вышло — оставшиеся диалоги по-прежнему «просрочены» и уйдут со следующим запуском.
      if (Date.now() >= deadline) break;
      budget -= 1;
      summary.scanned += 1;
      try {
        if (botFlags.get(conversation.id) === false) {
          summary.skipped += 1;
          continue;
        }
        const outcome = await processConversation(supabase, agent, conversation, deadline);
        summary[outcome] += 1;
      } catch (failure) {
        summary.failed += 1;
        console.error("[followup] conversation", conversation.id, failure instanceof Error ? failure.message : failure);
      }
    }
  }

  return summary;
}

async function processConversation(
  supabase: AdminClient,
  agent: FollowupAgent,
  conversation: FollowupConversation,
  deadline: number,
): Promise<"pushed" | "stopped" | "skipped" | "failed"> {
  const provider = readProvider(conversation.integration);
  if (!canSend(agent, provider)) {
    // Для виджета и других каналов отправить нечего — не копим диалог в очереди.
    await setWaiting(supabase, conversation.id, false);
    return "stopped";
  }

  const history = await loadHistory(supabase, conversation.id);
  // Клиент уже ответил (или истории нет) — напоминать не о чем.
  if (history.length === 0 || history[history.length - 1]!.role !== "assistant") {
    await setWaiting(supabase, conversation.id, false);
    return "stopped";
  }

  // Захватываем диалог, чтобы параллельный вебхук/прогон не ответил одновременно.
  if (!(await claim(supabase, conversation.id))) return "skipped";
  try {
    const decision = await decide(history, agent);
    if (decision.action === "stop" || !decision.message) {
      await setWaiting(supabase, conversation.id, false);
      return "stopped";
    }

    // Пауза только перед реальной отправкой (stop-решения её не тратят) и не дольше остатка бюджета.
    const jitter =
      SEND_JITTER_MIN_MS + Math.floor(Math.random() * (SEND_JITTER_MAX_MS - SEND_JITTER_MIN_MS + 1));
    await sleep(Math.max(0, Math.min(jitter, deadline - Date.now())));

    const evolutionWa = provider === "whatsapp" && isEvolutionInstance(String(agent.wa_instance_id ?? ""));
    if (evolutionWa) await storePush(supabase, conversation, decision.message, null);
    const delivered = await deliver(supabase, agent, provider, conversation, decision.message);
    const pushCount = (conversation.push_count ?? 0) + 1;
    const now = new Date().toISOString();

    if (!delivered.ok) {
      if (evolutionWa) {
        await supabase
          .from("messages")
          .delete()
          .eq("conversation_id", conversation.id)
          .eq("role", "assistant")
          .eq("content", decision.message)
          .is("external_message_id", null);
      }
      // Считаем попытку, чтобы сломанный канал не молотил LLM каждый час бесконечно.
      await supabase.from("conversations").update({ push_count: pushCount }).eq("id", conversation.id);
      return "failed";
    }

    if (evolutionWa) {
      if (delivered.externalId) {
        await supabase
          .from("messages")
          .update({ external_message_id: delivered.externalId })
          .eq("conversation_id", conversation.id)
          .eq("role", "assistant")
          .eq("content", decision.message)
          .is("external_message_id", null);
      }
    } else {
      await storePush(supabase, conversation, decision.message, delivered.externalId);
    }
    const { error } = await supabase
      .from("conversations")
      .update({
        last_agent_message_at: now,
        push_count: pushCount,
        last_message_preview: decision.message.slice(0, 140),
        last_message_at: now,
      })
      .eq("id", conversation.id);
    if (error) throw new Error(error.message);
    return "pushed";
  } finally {
    await release(supabase, conversation.id);
  }
}

type HistoryMessage = { role: "user" | "assistant"; content: string };

async function loadHistory(supabase: AdminClient, conversationId: string): Promise<HistoryMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .reverse()
    .map((row) => ({ role: row.role as "user" | "assistant", content: String(row.content ?? "") }));
}

type Decision = { action: "push" | "stop"; message: string | null };

async function decide(history: HistoryMessage[], agent: FollowupAgent): Promise<Decision> {
  const template = agent.followup_template?.trim() ?? "";
  // Шаблон обычно написан на языке владельца (RU) и тянет модель на свой язык — явно просим его переводить.
  const templateText = template
    ? `«${template}» (шаблон может быть на другом языке — передай только смысл и напиши на языке клиента)`
    : "не передан";
  const system = GATEKEEPER_PROMPT.replace(TEMPLATE_PLACEHOLDER, templateText);
  const transcript = history
    .map((item) => `${item.role === "assistant" ? "Agent" : "Client"}: ${item.content}`)
    .join("\n");
  // Инструкцию агента (на языке владельца) в запрос не кладём: она перетягивала язык ответа.
  const clientText = history
    .filter((item) => item.role === "user")
    .slice(-3)
    .map((item) => item.content)
    .join("\n")
    .trim();

  const languageNote = clientText
    ? `\n\nCLIENT'S LAST MESSAGES (write the follow-up in THIS language, whatever language the agent or the template used):\n<<<\n${clientText}\n>>>`
    : "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const completion = await getOpenAI().chat.completions.create({
      model: GATEKEEPER_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `Dialogue history (last ${HISTORY_LIMIT} messages):\n${transcript}${languageNote}${
            attempt > 0 ? "\n\nYour previous draft was in the wrong language. Rewrite it in the client's language." : ""
          }`,
        },
      ],
    });

    const decision = parseDecision(completion.choices[0]?.message?.content);
    if (decision.action === "stop" || !decision.message || !clientText) return decision;
    if (sameScript(clientText, decision.message)) return decision;
  }

  // Дважды промахнулись с языком — лучше не слать вообще, чем написать клиенту на чужом.
  return { action: "stop", message: null };
}

/** Грубая проверка алфавита: кириллица против латиницы. Ловит главный провал — русский пуш англоязычному клиенту. */
function sameScript(clientText: string, message: string) {
  const cyrillic = (text: string) => {
    const letters = text.match(/\p{L}/gu) ?? [];
    if (letters.length === 0) return null;
    return letters.filter((char) => /\p{Script=Cyrillic}/u.test(char)).length / letters.length > 0.5;
  };
  const client = cyrillic(clientText);
  const reply = cyrillic(message);
  return client === null || reply === null || client === reply;
}

/** Ответ модели — недоверенный ввод: любое отклонение от схемы трактуем как «не слать». */
export function parseDecision(raw: string | null | undefined): Decision {
  try {
    const parsed = JSON.parse(raw ?? "") as { action?: unknown; message?: unknown };
    if (parsed.action === "push" && typeof parsed.message === "string") {
      const message = stripMarkdown(parsed.message).trim().slice(0, 1000);
      if (message) return { action: "push", message };
    }
  } catch {
    // невалидный JSON — ниже вернём stop
  }
  return { action: "stop", message: null };
}

function mailConfig(agent: FollowupAgent): EmailConfig | null {
  const email = agent.email_address?.trim().toLowerCase() ?? "";
  const password = agent.email_password ?? "";
  const smtpHost = agent.email_smtp_host?.trim() ?? "";
  if (!email || !password.trim() || !smtpHost) return null;
  return {
    email,
    password,
    imapHost: "localhost",
    imapPort: 993,
    smtpHost,
    smtpPort: Number(agent.email_smtp_port) || 465,
  };
}

function messageIdOrNull(value: unknown) {
  const id = typeof value === "string" ? value.trim() : "";
  return id.includes("@") ? id : null;
}

function readProvider(integration: FollowupConversation["integration"]) {
  const row = Array.isArray(integration) ? integration[0] : integration;
  return row?.provider ?? "";
}

function channelOn(channels: unknown, key: "whatsapp" | "telegram") {
  if (!channels || typeof channels !== "object" || Array.isArray(channels)) return true;
  return (channels as Record<string, unknown>)[key] !== false;
}

function canSend(agent: FollowupAgent, provider: string) {
  if (provider === "whatsapp") {
    return agent.wa_is_active === true && Boolean(agent.wa_instance_id && agent.wa_api_token) && channelOn(agent.active_channels, "whatsapp");
  }
  if (provider === "telegram") {
    return agent.tg_is_active === true && Boolean(agent.tg_bot_token) && channelOn(agent.active_channels, "telegram");
  }
  if (provider === "sms") {
    return (
      agent.twilio_sms_enabled === true &&
      Boolean(agent.twilio_account_sid && agent.twilio_auth_token && agent.twilio_sms_number)
    );
  }
  if (provider === "viber") return agent.viber_enabled === true && Boolean(agent.viber_auth_token);
  if (provider === "messenger") return agent.fb_messenger_enabled === true && Boolean(agent.fb_page_access_token);
  if (provider === "email") {
    return agent.email_enabled === true && Boolean(agent.email_address && agent.email_password && agent.email_smtp_host);
  }
  return false;
}

async function deliver(
  supabase: AdminClient,
  agent: FollowupAgent,
  provider: string,
  conversation: FollowupConversation,
  text: string,
) {
  const chatId = conversation.external_chat_id;
  try {
    if (provider === "messenger") {
      const sent = await sendMessengerMessage({
        pageAccessToken: String(agent.fb_page_access_token),
        recipientId: chatId,
        text,
      });
      if (!sent.ok) throw new Error(sent.error);
      return { ok: true as const, externalId: null };
    }
    if (provider === "viber") {
      const sent = await sendViberMessage({
        authToken: String(agent.viber_auth_token),
        receiver: chatId,
        text,
        senderName: agent.viber_bot_name?.trim() || "Ассистент",
      });
      if (!sent.ok) throw new Error(sent.error);
      return { ok: true as const, externalId: null };
    }
    if (provider === "email") {
      const config = mailConfig(agent);
      if (!config) throw new Error("Почта агента не настроена.");
      const thread = await supabase
        .from("messages")
        .select("external_message_id")
        .eq("conversation_id", conversation.id)
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const messageId = messageIdOrNull(thread.data?.external_message_id);
      const sent = await sendEmailReply({
        config,
        to: chatId,
        subject: "ваше письмо",
        text,
        inReplyTo: messageId,
        references: messageId,
      });
      if (!sent.ok) throw new Error(sent.error);
      return { ok: true as const, externalId: sent.messageId };
    }
    if (provider === "sms") {
      const sent = await sendTwilioSms({
        accountSid: String(agent.twilio_account_sid),
        authToken: String(agent.twilio_auth_token),
        from: String(agent.twilio_sms_number),
        to: chatId,
        body: text,
      });
      if (!sent.ok) throw new Error(sent.error);
      return { ok: true as const, externalId: sent.sid };
    }
    if (provider === "whatsapp") {
      const externalId = await sendConnectedWhatsApp(String(agent.wa_instance_id), String(agent.wa_api_token), chatId, text);
      return { ok: true as const, externalId };
    }
    const response = await fetch(`https://api.telegram.org/bot${agent.tg_bot_token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Telegram sendMessage ${response.status}`);
    return { ok: true as const, externalId: null };
  } catch (failure) {
    console.error("[followup] send", failure instanceof Error ? failure.message : failure);
    return { ok: false as const, externalId: null };
  }
}

async function storePush(
  supabase: AdminClient,
  conversation: FollowupConversation,
  content: string,
  externalId: string | null,
) {
  // Эхо исходящего WhatsApp-вебхука могло уже записать это сообщение по idMessage.
  if (externalId) {
    const { data } = await supabase.from("messages").select("id").eq("external_message_id", externalId).limit(1);
    if (data && data.length > 0) return;
  }
  const { error } = await supabase.from("messages").insert({
    user_id: conversation.user_id,
    conversation_id: conversation.id,
    role: "assistant",
    content,
    status: "sent",
    external_message_id: externalId,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}

async function setWaiting(supabase: AdminClient, conversationId: string, waiting: boolean) {
  const { error } = await supabase.from("conversations").update({ is_waiting_for_user: waiting }).eq("id", conversationId);
  if (error) throw new Error(error.message);
}

async function claim(supabase: AdminClient, conversationId: string) {
  const { data, error } = await supabase
    .from("conversations")
    .update({ is_processing: true })
    .eq("id", conversationId)
    .eq("is_processing", false)
    .select("id");
  if (error) throw new Error(error.message);
  return Boolean(data && data.length > 0);
}

async function release(supabase: AdminClient, conversationId: string) {
  const { error } = await supabase.from("conversations").update({ is_processing: false }).eq("id", conversationId);
  if (error) console.error("[followup] unlock", error.message);
}
