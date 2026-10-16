import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";

import { pauseBotForHandoff } from "@/lib/bot-state";
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

async function runNotifyManager(raw: string, chat: NotifyChat) {
  const parsed = parseNotifyArgs(raw);
  if ("error" in parsed) return { ok: false, notified: false, paused: false, error: parsed.error };

  const telegramChatId = await readAgentTelegramChatId(chat);
  if (!telegramChatId) {
    console.error("[notify-manager] у агента не заполнен telegram_chat_id");
    return {
      ok: true,
      notified: false,
      paused: false,
      reason: "У агента не указан telegram_chat_id, уведомление пропущено.",
    };
  }

  const sent = await sendTelegramNotification(telegramChatId, formatLead(parsed, chat));
  if (!sent.ok) return { ok: false, notified: false, paused: false, error: sent.error };

  if (!parsed.recommend_pause) return { ok: true, notified: true, paused: false };

  try {
    await pauseBotForHandoff(chat.supabase, chat.conversationId, "forever");
    return { ok: true, notified: true, paused: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось поставить чат на паузу.";
    console.error("[notify-manager] pause", message);
    return { ok: true, notified: true, paused: false, error: message };
  }
}

async function readAgentTelegramChatId(chat: NotifyChat) {
  const agentId = chat.agentId || (await readConversationAgentId(chat));
  if (!agentId) return "";

  const { data, error } = await chat.supabase.from("agents").select("telegram_chat_id").eq("id", agentId).maybeSingle();
  if (error) {
    if (error.message.includes("telegram_chat_id")) {
      console.error("[notify-manager]", error.message);
      return "";
    }
    throw new Error(error.message);
  }

  return typeof data?.telegram_chat_id === "string" ? data.telegram_chat_id.trim() : "";
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
  const handle = chat.clientHandle.trim();
  if (chat.channel === "whatsapp") {
    const digits = handle.replace(/@.*/, "").replace(/\D/g, "");
    if (digits.length >= 8 && !handle.includes("@g.us")) {
      return `<a href="https://wa.me/${digits}">${escapeHtml(digits)}</a>`;
    }
  }
  if (chat.channel === "telegram") {
    const username = handle.replace(/^@/, "");
    if (/^[A-Za-z0-9_]{5,}$/.test(username) && !/^\d+$/.test(username)) {
      return `<a href="https://t.me/${escapeHtml(username)}">@${escapeHtml(username)}</a>`;
    }
  }
  return escapeHtml(handle || "неизвестен");
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
