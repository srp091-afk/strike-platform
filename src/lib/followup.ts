import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readBotFlags } from "@/lib/bot-state";
import { readFollowupInterval, readFollowupMaxCount } from "@/lib/agent-models";
import { sendGreenMessage } from "@/lib/green-api";
import { getOpenAI } from "@/lib/openai";
import { stripMarkdown } from "@/lib/reply";

/** Модель-«контролёр»: json_object поддерживают gpt-4o-семейства, ответ короткий — берём дешёвую. */
const GATEKEEPER_MODEL = "gpt-4o-mini";
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

  const { data: agents, error } = await supabase
    .from("agents")
    .select(
      "id, is_active, followup_interval_hours, followup_max_count, followup_template, system_prompt, wa_instance_id, wa_api_token, wa_is_active, tg_bot_token, tg_is_active, active_channels",
    )
    .eq("followup_enabled", true);
  if (error) throw new Error(error.message);

  let budget = MAX_CONVERSATIONS_PER_RUN;
  for (const agent of (agents ?? []) as FollowupAgent[]) {
    if (budget <= 0) break;
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
      budget -= 1;
      summary.scanned += 1;
      try {
        if (botFlags.get(conversation.id) === false) {
          summary.skipped += 1;
          continue;
        }
        const outcome = await processConversation(supabase, agent, conversation);
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

    const delivered = await deliver(agent, provider, conversation.external_chat_id, decision.message);
    const pushCount = (conversation.push_count ?? 0) + 1;
    const now = new Date().toISOString();

    if (!delivered.ok) {
      // Считаем попытку, чтобы сломанный канал не молотил LLM каждый час бесконечно.
      await supabase.from("conversations").update({ push_count: pushCount }).eq("id", conversation.id);
      return "failed";
    }

    await storePush(supabase, conversation, decision.message, delivered.externalId);
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
  const templateText = template ? `«${template}»` : "не передан";
  const system = GATEKEEPER_PROMPT.replace(TEMPLATE_PLACEHOLDER, templateText);
  const transcript = history
    .map((item) => `${item.role === "assistant" ? "Агент" : "Клиент"}: ${item.content}`)
    .join("\n");
  const persona = agent.system_prompt?.trim().slice(0, 2000);

  const completion = await getOpenAI().chat.completions.create({
    model: GATEKEEPER_MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `${persona ? `Инструкция агента (для контекста):\n${persona}\n\n` : ""}История диалога (последние ${HISTORY_LIMIT} сообщений):\n${transcript}`,
      },
    ],
  });

  return parseDecision(completion.choices[0]?.message?.content);
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
  return false;
}

async function deliver(agent: FollowupAgent, provider: string, chatId: string, text: string) {
  try {
    if (provider === "whatsapp") {
      const externalId = await sendGreenMessage(chatId, text, {
        idInstance: String(agent.wa_instance_id),
        apiToken: String(agent.wa_api_token),
      });
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
