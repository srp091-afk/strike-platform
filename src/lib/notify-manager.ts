import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";

import { pauseBotForHandoff } from "@/lib/bot-state";
import { sendLeadEmail } from "@/lib/email-notify";
import { getOpenAI } from "@/lib/openai";
import { sendTelegramNotification } from "@/lib/telegram-notify";

export type NotifyChat = {
  supabase: SupabaseClient;
  conversationId: string;
  agentId: string | null;
  channel: "whatsapp" | "telegram" | "instagram" | "unknown";
  clientHandle: string;
  clientName: string | null;
};

const notifyDescription =
  "Сообщить живому менеджеру о целевом действии клиента и, если нужно, остановить ответы бота в этом чате. Вызывай только когда это прямо следует из системных инструкций.";

const notifyParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    event_reason: {
      type: "string",
      description: "Кратко, почему нужно уведомить менеджера.",
    },
    extracted_data: {
      type: "object",
      description: "Собранные из диалога поля: имя, телефон, время, адрес и любые другие пары ключ-значение.",
      additionalProperties: { type: "string" },
    },
    recommend_pause: {
      type: "boolean",
      description: "Остановить ИИ в этом чате после уведомления, чтобы диалог забрал менеджер.",
    },
  },
  required: ["event_reason", "extracted_data", "recommend_pause"],
};

const notifyManagerTool: OpenAI.Chat.ChatCompletionTool = {
  type: "function",
  function: {
    name: "notify_manager",
    description: notifyDescription,
    parameters: notifyParameters,
  },
};

const notifyManagerResponseTool: OpenAI.Responses.FunctionTool = {
  type: "function",
  name: "notify_manager",
  description: notifyDescription,
  parameters: notifyParameters,
  strict: false,
};

export async function completeWithNotifyManager(input: {
  model: string;
  temperature: number;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  chat: NotifyChat;
}) {
  if (input.model.includes("gpt-6")) return completeWithResponses(input);
  return completeWithChat(input);
}

async function completeWithResponses(input: {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  chat: NotifyChat;
}) {
  const client = getOpenAI();
  const first = await client.responses.create({
    model: input.model,
    input: toResponseInput(input.messages),
    tools: [notifyManagerResponseTool],
    tool_choice: "auto",
    store: true,
  });

  const calls = first.output.filter(
    (item): item is OpenAI.Responses.ResponseFunctionToolCall =>
      item.type === "function_call" && item.name === "notify_manager",
  );
  if (calls.length === 0) return { text: first.output_text.trim(), pausedByTool: false };

  let pausedByTool = false;
  const toolOutputs: OpenAI.Responses.ResponseInputItem.FunctionCallOutput[] = [];
  for (const call of calls) {
    const result = await runNotifyManager(call.arguments, input.chat);
    if (result.paused) pausedByTool = true;
    toolOutputs.push({
      type: "function_call_output",
      call_id: call.call_id,
      output: JSON.stringify(result),
    });
  }

  const second = await client.responses.create({
    model: input.model,
    previous_response_id: first.id,
    input: toolOutputs,
    tools: [notifyManagerResponseTool],
    tool_choice: "none",
  });

  return { text: second.output_text.trim(), pausedByTool };
}

function toResponseInput(messages: OpenAI.Chat.ChatCompletionMessageParam[]): OpenAI.Responses.ResponseInput {
  const input: OpenAI.Responses.EasyInputMessage[] = [];
  for (const message of messages) {
    if (message.role !== "system" && message.role !== "user" && message.role !== "assistant") continue;
    const content = responseContent(message.content);
    if (content === null) continue;
    input.push({ role: message.role, content });
  }
  return input;
}

function responseContent(
  content: OpenAI.Chat.ChatCompletionMessageParam["content"],
): OpenAI.Responses.EasyInputMessage["content"] | null {
  if (typeof content === "string") return content;
  if (content == null || !Array.isArray(content)) return null;

  const parts: OpenAI.Responses.ResponseInputContent[] = [];
  for (const part of content) {
    if (part.type === "text" && part.text.trim()) {
      parts.push({ type: "input_text", text: part.text });
      continue;
    }
    if (part.type !== "image_url") continue;
    const url = typeof part.image_url === "string" ? part.image_url : part.image_url.url;
    if (url) parts.push({ type: "input_image", image_url: url, detail: "auto" });
  }
  return parts.length > 0 ? parts : null;
}

async function completeWithChat(input: {
  model: string;
  temperature: number;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  chat: NotifyChat;
}) {
  const first = await getOpenAI().chat.completions.create({
    model: input.model,
    temperature: input.temperature,
    messages: input.messages,
    tools: [notifyManagerTool],
    tool_choice: "auto",
  });

  const choice = first.choices[0]?.message;
  const calls = (choice?.tool_calls ?? []).filter(
    (call): call is OpenAI.Chat.ChatCompletionMessageFunctionToolCall =>
      call.type === "function" && call.function.name === "notify_manager",
  );
  if (!choice || calls.length === 0) {
    return { text: choice?.content?.trim() ?? "", pausedByTool: false };
  }

  let pausedByTool = false;
  const toolMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];
  for (const call of calls) {
    const result = await runNotifyManager(call.function.arguments, input.chat);
    if (result.paused) pausedByTool = true;
    toolMessages.push({
      role: "tool",
      tool_call_id: call.id,
      content: JSON.stringify(result),
    });
  }

  const second = await getOpenAI().chat.completions.create({
    model: input.model,
    temperature: input.temperature,
    messages: [
      ...input.messages,
      {
        role: "assistant",
        content: choice.content,
        tool_calls: choice.tool_calls,
      },
      ...toolMessages,
    ],
  });

  return { text: second.choices[0]?.message?.content?.trim() ?? "", pausedByTool };
}

/**
 * Инструмент никогда не должен ронять генерацию ответа клиенту: любая проблема
 * с уведомлением (нет telegram_chat_id, Telegram API отклонил запрос, сбой БД)
 * превращается в мягкий успешный результат для модели, чтобы она завершила
 * сессию финальным текстом, а детали остаются только в серверных логах.
 */
async function runNotifyManager(raw: string, chat: NotifyChat) {
  const parsed = parseNotifyArgs(raw);
  if ("error" in parsed) return { ok: false, notified: false, paused: false, error: parsed.error };

  try {
    const settings = await readAgentNotifySettings(chat);
    const telegramOn = Boolean(settings.telegramChatId);
    const emailOn = settings.notifyEmailEnabled && Boolean(settings.notifyEmailAddress);
    if (!telegramOn && !emailOn) {
      console.warn("[notify-manager] у агента не настроены Telegram и Email, уведомление пропущено");
      return {
        success: true,
        ok: true,
        notified: false,
        paused: false,
        note: "Уведомление пропущено (не настроен канал)",
      };
    }

    let notified = false;
    if (telegramOn) {
      const sent = await sendTelegramNotification(settings.telegramChatId, formatLead(parsed, chat));
      if (sent.ok) notified = true;
      else console.error("[notify-manager] Telegram не доставил уведомление:", sent.error);
    }

    if (emailOn) {
      const contact = contactLink(chat);
      const sent = await sendLeadEmail({
        to: settings.notifyEmailAddress,
        agentName: settings.agentName,
        reason: parsed.event_reason,
        channel: channelLabel(chat.channel),
        clientName: chat.clientName,
        contact: contact.label,
        contactUrl: contact.url,
        fields: parsed.extracted_data,
        paused: parsed.recommend_pause,
        history: await readDialogHistory(chat),
      });
      if (sent.ok) notified = true;
      else console.error("[notify-manager] письмо о лиде не отправлено:", sent.error);
    }

    if (!notified) {
      return {
        success: true,
        ok: true,
        notified: false,
        paused: false,
        note: "Уведомление пропущено (не настроен канал)",
      };
    }

    if (!parsed.recommend_pause) return { success: true, ok: true, notified: true, paused: false };

    try {
      await pauseBotForHandoff(chat.supabase, chat.conversationId, "forever");
      return { success: true, ok: true, notified: true, paused: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Не удалось поставить чат на паузу.";
      console.error("[notify-manager] pause", message);
      return { success: true, ok: true, notified: true, paused: false, error: message };
    }
  } catch (error) {
    console.error("[notify-manager] уведомление пропущено из-за ошибки:", error instanceof Error ? error.message : error);
    return {
      success: true,
      ok: true,
      notified: false,
      paused: false,
      note: "Уведомление пропущено (не настроен канал)",
    };
  }
}

type AgentNotifySettings = {
  agentName: string;
  telegramChatId: string;
  notifyEmailEnabled: boolean;
  notifyEmailAddress: string;
};

async function readAgentNotifySettings(chat: NotifyChat): Promise<AgentNotifySettings> {
  const empty: AgentNotifySettings = {
    agentName: "Агент",
    telegramChatId: "",
    notifyEmailEnabled: false,
    notifyEmailAddress: "",
  };
  const agentId = chat.agentId || (await readConversationAgentId(chat));
  if (!agentId) return empty;

  const full = await chat.supabase
    .from("agents")
    .select("name, telegram_chat_id, notify_email_enabled, notify_email_address")
    .eq("id", agentId)
    .maybeSingle();

  const row =
    full.error && (full.error.message.includes("notify_email_enabled") || full.error.message.includes("notify_email_address"))
      ? await chat.supabase.from("agents").select("name, telegram_chat_id").eq("id", agentId).maybeSingle()
      : full;

  if (row.error) {
    if (row.error.message.includes("telegram_chat_id") || row.error.message.includes("notify_email")) {
      console.warn("[notify-manager] не удалось прочитать настройки уведомлений:", row.error.message);
      return empty;
    }
    throw new Error(row.error.message);
  }

  const data = (row.data ?? {}) as Record<string, unknown>;
  const address = typeof data.notify_email_address === "string" ? data.notify_email_address.trim() : "";
  return {
    agentName: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Агент",
    telegramChatId: typeof data.telegram_chat_id === "string" ? data.telegram_chat_id.trim() : "",
    notifyEmailEnabled: data.notify_email_enabled === true,
    notifyEmailAddress: address,
  };
}

async function readDialogHistory(chat: NotifyChat) {
  const { data, error } = await chat.supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", chat.conversationId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) {
    console.warn("[notify-manager] не удалось прочитать историю диалога:", error.message);
    return [];
  }

  return (data ?? [])
    .reverse()
    .map((row) => ({
      role: row.role === "user" ? ("user" as const) : ("assistant" as const),
      content: typeof row.content === "string" ? row.content.replace(/\s+/g, " ").trim().slice(0, 500) : "",
    }))
    .filter((row) => row.content);
}

async function readConversationAgentId(chat: NotifyChat) {
  const { data, error } = await chat.supabase
    .from("conversations")
    .select("agent_id")
    .eq("id", chat.conversationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return typeof data?.agent_id === "string" ? data.agent_id : "";
}

function parseNotifyArgs(raw: string) {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { error: "Аргументы notify_manager не являются JSON." };
  }

  const record = asRecord(body);
  const eventReason = text(record.event_reason);
  if (!eventReason) return { error: "Не указан event_reason." };

  return {
    event_reason: eventReason.slice(0, 500),
    extracted_data: stringMap(record.extracted_data),
    recommend_pause: record.recommend_pause === true,
  };
}

function formatLead(
  input: { event_reason: string; extracted_data: Record<string, string>; recommend_pause: boolean },
  chat: NotifyChat,
) {
  const lines = [
    "<b>Новый лид</b>",
    `<b>Причина:</b> ${escapeHtml(input.event_reason)}`,
    `<b>Канал:</b> ${escapeHtml(channelLabel(chat.channel))}`,
  ];
  if (chat.clientName) lines.push(`<b>Клиент:</b> ${escapeHtml(chat.clientName)}`);
  lines.push(`<b>Чат:</b> ${formatChat(chat)}`);
  const entries = Object.entries(input.extracted_data);
  if (entries.length > 0) {
    lines.push("", "<b>Данные</b>");
    for (const [key, value] of entries) {
      lines.push(`• ${escapeHtml(key)}: ${escapeHtml(value)}`);
    }
  }
  if (input.recommend_pause) lines.push("", "Бот в этом чате остановлен.");
  return lines.join("\n");
}

function formatChat(chat: NotifyChat) {
  const link = contactLink(chat);
  if (!link.url) return escapeHtml(link.label);
  return `<a href="${link.url}">${escapeHtml(link.label)}</a>`;
}

function contactLink(chat: NotifyChat) {
  const handle = chat.clientHandle.trim();
  if (chat.channel === "whatsapp") {
    const digits = handle.replace(/@.*/, "").replace(/\D/g, "");
    if (digits.length >= 8 && !handle.includes("@g.us")) return { label: digits, url: `https://wa.me/${digits}` };
  }
  if (chat.channel === "telegram") {
    const username = handle.replace(/^@/, "");
    if (/^[A-Za-z0-9_]{5,}$/.test(username) && !/^\d+$/.test(username)) {
      return { label: `@${username}`, url: `https://t.me/${username}` };
    }
  }
  return { label: handle || "неизвестен", url: null as string | null };
}

function channelLabel(channel: NotifyChat["channel"]) {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "telegram") return "Telegram";
  if (channel === "instagram") return "Instagram";
  return "Канал";
}

function stringMap(value: unknown) {
  const record = asRecord(value);
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(record)) {
    const rendered = text(item);
    if (!key.trim() || !rendered) continue;
    result[key.trim().slice(0, 80)] = rendered.slice(0, 500);
  }
  return result;
}

function text(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "да" : "нет";
  return "";
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
