import "server-only";

import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";

import { pauseBotForHandoff } from "@/lib/bot-state";
import { sendLeadEmail } from "@/lib/email-notify";
import { calendarSystemRule, calendarTimezone, runCalendarTool } from "@/lib/google-calendar";
import { getOpenAI } from "@/lib/openai";
import { sendTelegramNotification } from "@/lib/telegram-notify";
import { phoneFromHandle } from "@/lib/utils/prompt-parser";
import { syncAgentTurnToAmo } from "@/lib/amocrm";
import { syncAgentTurnToBitrix } from "@/lib/bitrix24";
import { syncAgentTurnToPipedrive } from "@/lib/pipedrive";
import { dispatchAgentWebhook, loadAgentWebhook, type WebhookAgent } from "@/lib/webhooks";
import { bookingSystemRule, dikidiSystemRule, loadAgentBooking, runYclientsTool, type AgentBooking } from "@/lib/yclients";
import { loadPaymentProviders, paymentSystemRule, runPaymentTool, type PaymentProvider } from "@/lib/payments";

export type NotifyChat = {
  supabase: SupabaseClient;
  conversationId: string;
  agentId: string | null;
  channel: string;
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

const checkAvailabilityParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    date: { type: "string", description: "Дата в формате YYYY-MM-DD." },
  },
  required: ["date"],
};

const bookSlotParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    start_time: { type: "string", description: "Начало слота, как в ответе check_availability." },
    end_time: { type: "string", description: "Конец слота, как в ответе check_availability." },
    client_name: { type: "string", description: "Имя клиента." },
    client_contact: { type: "string", description: "Телефон или другой контакт клиента." },
  },
  required: ["start_time", "end_time", "client_name", "client_contact"],
};

const calendarChatTools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description: "Используй для проверки свободных мест на конкретную дату.",
      parameters: checkAvailabilityParameters,
    },
  },
  {
    type: "function",
    function: {
      name: "book_slot",
      description: "Используй для записи клиента, когда он выбрал конкретное время.",
      parameters: bookSlotParameters,
    },
  },
];

const bookingServicesParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    staff_id: { type: "number", description: "Необязательный ID мастера, чтобы оставить только его услуги." },
  },
  required: [],
};

const bookingStaffParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    service_ids: {
      type: "array",
      items: { type: "number" },
      description: "Необязательные ID услуг, чтобы оставить мастеров, которые их оказывают.",
    },
  },
  required: [],
};

const bookingSlotsParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    date: { type: "string", description: "Дата в формате YYYY-MM-DD." },
    staff_id: { type: "number", description: "ID мастера. Не передавай, если клиент ещё не выбрал мастера." },
    service_ids: { type: "array", items: { type: "number" }, description: "ID выбранных услуг." },
  },
  required: ["date"],
};

const bookingRecordParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    fullname: { type: "string", description: "Имя клиента. Сначала уточни его в диалоге." },
    phone: { type: "string", description: "Телефон клиента. Сначала уточни его в диалоге." },
    email: { type: "string", description: "Email клиента, если он сам его назвал." },
    service_ids: { type: "array", items: { type: "number" }, description: "ID услуг из booking_get_services." },
    staff_id: { type: "number", description: "ID мастера из booking_get_staff или слота." },
    datetime: { type: "string", description: "Дата и время слота, как datetime в ответе booking_check_slots." },
    comment: { type: "string", description: "Короткий комментарий к записи, если клиент его оставил." },
  },
  required: ["fullname", "phone", "service_ids", "staff_id", "datetime"],
};

const bookingChatTools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "booking_get_services",
      description: "Получить список услуг и цен онлайн-записи. Можно сузить по staff_id.",
      parameters: bookingServicesParameters,
    },
  },
  {
    type: "function",
    function: {
      name: "booking_get_staff",
      description: "Получить список мастеров онлайн-записи. Можно сузить по service_ids.",
      parameters: bookingStaffParameters,
    },
  },
  {
    type: "function",
    function: {
      name: "booking_check_slots",
      description: "Проверить свободные окошки на конкретную дату YYYY-MM-DD. Если мастер не выбран, не передавай staff_id.",
      parameters: bookingSlotsParameters,
    },
  },
  {
    type: "function",
    function: {
      name: "booking_create_record",
      description: "Записать клиента. Перед вызовом уточни имя и телефон и получи подтверждение времени. Не выдумывай свободное окно.",
      parameters: bookingRecordParameters,
    },
  },
];

const bookingResponseTools: OpenAI.Responses.FunctionTool[] = [
  {
    type: "function",
    name: "booking_get_services",
    description: "Получить список услуг и цен онлайн-записи. Можно сузить по staff_id.",
    parameters: bookingServicesParameters,
    strict: false,
  },
  {
    type: "function",
    name: "booking_get_staff",
    description: "Получить список мастеров онлайн-записи. Можно сузить по service_ids.",
    parameters: bookingStaffParameters,
    strict: false,
  },
  {
    type: "function",
    name: "booking_check_slots",
    description: "Проверить свободные окошки на конкретную дату YYYY-MM-DD. Если мастер не выбран, не передавай staff_id.",
    parameters: bookingSlotsParameters,
    strict: false,
  },
  {
    type: "function",
    name: "booking_create_record",
    description: "Записать клиента. Перед вызовом уточни имя и телефон и получи подтверждение времени. Не выдумывай свободное окно.",
    parameters: bookingRecordParameters,
    strict: false,
  },
];

const paymentParameters = {
  type: "object",
  additionalProperties: false,
  properties: {
    amount: { type: "number", description: "Итоговая сумма к оплате. Бери её только из базы знаний или инструкций." },
    description: { type: "string", description: "Название товара, курса или услуги." },
    currency: { type: "string", description: "Валюта: USD, EUR, RUB. Если не указана, берётся валюта шлюза." },
    provider: {
      type: "string",
      enum: ["stripe", "yookassa", "prodamus"],
      description: "Платёжный шлюз. Не передавай, если подключён только один.",
    },
  },
  required: ["amount", "description"],
};

const paymentChatTools: OpenAI.Chat.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_payment_link",
      description: "Создаёт уникальную платёжную ссылку для клиента и возвращает URL для отправки в чат.",
      parameters: paymentParameters,
    },
  },
];

const paymentResponseTools: OpenAI.Responses.FunctionTool[] = [
  {
    type: "function",
    name: "create_payment_link",
    description: "Создаёт уникальную платёжную ссылку для клиента и возвращает URL для отправки в чат.",
    parameters: paymentParameters,
    strict: false,
  },
];

const calendarResponseTools: OpenAI.Responses.FunctionTool[] = [
  {
    type: "function",
    name: "check_availability",
    description: "Используй для проверки свободных мест на конкретную дату.",
    parameters: checkAvailabilityParameters,
    strict: false,
  },
  {
    type: "function",
    name: "book_slot",
    description: "Используй для записи клиента, когда он выбрал конкретное время.",
    parameters: bookSlotParameters,
    strict: false,
  },
];

export type AgentTurnDelivery = {
  channel: string;
  chatId: string;
  client?: { name?: string | null; phone?: string | null; username?: string | null };
};

export async function completeWithNotifyManager(input: {
  model: string;
  temperature: number;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  chat: NotifyChat;
  /** Перекрывает канал из чата, если провайдер шире, чем whatsapp/telegram/instagram. */
  delivery?: AgentTurnDelivery;
}) {
  return completeTurn({ ...input, agentId: input.chat.agentId, chat: input.chat });
}

/** Ответ песочницы, виджета и звонков Twilio: календарь есть, уведомление менеджера нет. */
export async function completeWithCalendar(input: {
  model: string;
  temperature: number;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  agentId: string;
  delivery?: AgentTurnDelivery;
}) {
  return completeTurn({ ...input, chat: null });
}

type TurnSide = {
  agentId: string | null;
  delivery: { channel: string; chatId: string; client: { name: string | null; phone: string | null; username: string | null } };
  target: WebhookAgent | null;
  inbound: string;
  handoffReason: string | null;
};

async function completeTurn(input: {
  model: string;
  temperature: number;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  agentId: string | null;
  chat: NotifyChat | null;
  delivery?: AgentTurnDelivery;
}) {
  const [timezone, target, booking, payments] = await Promise.all([
    input.agentId ? calendarTimezone(input.agentId) : Promise.resolve(null),
    input.agentId ? loadAgentWebhook(input.agentId) : Promise.resolve(null),
    input.agentId ? loadAgentBooking(input.agentId) : Promise.resolve(null),
    input.agentId ? loadPaymentProviders(input.agentId) : Promise.resolve([] as PaymentProvider[]),
  ]);
  const inbound = lastUserText(input.messages);
  const turn: TurnSide = {
    agentId: input.agentId,
    delivery: resolveDelivery(input),
    target,
    inbound,
    handoffReason: null,
  };
  if (inbound) {
    emitWebhook(turn, { event: "message.received", message: { role: "user", text: inbound }, metadata: {} });
  }
  const prepared = {
    ...input,
    messages: withSystemRules(input.messages, agentRules(timezone, booking, payments)),
    calendar: Boolean(timezone),
    booking: Boolean(booking?.creds),
    payments: payments.length > 0,
    turn,
  };
  if (input.model.includes("gpt-6")) return completeWithResponses(prepared);
  return completeWithChat(prepared);
}

async function completeWithResponses(input: {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  agentId: string | null;
  chat: NotifyChat | null;
  calendar: boolean;
  booking: boolean;
  payments: boolean;
  turn: TurnSide;
}) {
  const client = getOpenAI();
  const tools = responseTools(input.chat, input.calendar, input.booking, input.payments);
  const first = await client.responses.create({
    model: input.model,
    input: toResponseInput(input.messages),
    ...(tools.length ? { tools, tool_choice: "auto" as const } : {}),
    store: true,
  });

  const calls = first.output.filter(
    (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
  );
  if (calls.length === 0) return publishReply(input.turn, first.output_text, false);

  let pausedByTool = false;
  const toolOutputs: OpenAI.Responses.ResponseInputItem.FunctionCallOutput[] = [];
  for (const call of calls) {
    const result = await runTool(call.name, call.arguments, input);
    if (result.paused) pausedByTool = true;
    toolOutputs.push({
      type: "function_call_output",
      call_id: call.call_id,
      output: result.output,
    });
  }

  const second = await client.responses.create({
    model: input.model,
    previous_response_id: first.id,
    input: toolOutputs,
    ...(tools.length ? { tools, tool_choice: "none" as const } : {}),
  });

  return publishReply(input.turn, second.output_text, pausedByTool);
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
  agentId: string | null;
  chat: NotifyChat | null;
  calendar: boolean;
  booking: boolean;
  payments: boolean;
  turn: TurnSide;
}) {
  const tools = chatTools(input.chat, input.calendar, input.booking, input.payments);
  const first = await getOpenAI().chat.completions.create({
    model: input.model,
    temperature: input.temperature,
    messages: input.messages,
    ...(tools.length ? { tools, tool_choice: "auto" as const } : {}),
  });

  const choice = first.choices[0]?.message;
  const calls = (choice?.tool_calls ?? []).filter(
    (call): call is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => call.type === "function",
  );
  if (!choice || calls.length === 0) {
    return publishReply(input.turn, choice?.content ?? "", false);
  }

  let pausedByTool = false;
  const toolMessages: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];
  for (const call of calls) {
    const result = await runTool(call.function.name, call.function.arguments, input);
    if (result.paused) pausedByTool = true;
    toolMessages.push({
      role: "tool",
      tool_call_id: call.id,
      content: result.output,
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

  return publishReply(input.turn, second.choices[0]?.message?.content ?? "", pausedByTool);
}

function chatTools(chat: NotifyChat | null, calendar: boolean, booking: boolean, payments: boolean): OpenAI.Chat.ChatCompletionTool[] {
  return [...(chat ? [notifyManagerTool] : []), ...(calendar ? calendarChatTools : []), ...(booking ? bookingChatTools : []), ...(payments ? paymentChatTools : [])];
}

function responseTools(chat: NotifyChat | null, calendar: boolean, booking: boolean, payments: boolean): OpenAI.Responses.FunctionTool[] {
  return [...(chat ? [notifyManagerResponseTool] : []), ...(calendar ? calendarResponseTools : []), ...(booking ? bookingResponseTools : []), ...(payments ? paymentResponseTools : [])];
}

function agentRules(timezone: string | null, booking: AgentBooking | null, payments: PaymentProvider[]) {
  const rules: string[] = [];
  if (timezone) rules.push(calendarSystemRule(timezone));
  if (booking?.creds) rules.push(bookingSystemRule(booking.creds.platform, timezone ?? "UTC"));
  if (booking?.dikidiUrl) rules.push(dikidiSystemRule(booking.dikidiUrl));
  if (payments.length) rules.push(paymentSystemRule(payments));
  return rules;
}

function withSystemRules(messages: OpenAI.Chat.ChatCompletionMessageParam[], rules: string[]) {
  const extra = rules.filter(Boolean).join("\n\n");
  if (!extra) return messages;
  const index = messages.findIndex((message) => message.role === "system" && typeof message.content === "string");
  if (index === -1) return [{ role: "system" as const, content: extra }, ...messages];
  return messages.map((message, item) =>
    item === index && message.role === "system" && typeof message.content === "string"
      ? { ...message, content: `${message.content}\n\n${extra}` }
      : message,
  );
}

async function runTool(
  name: string,
  args: string,
  input: { agentId: string | null; chat: NotifyChat | null; turn: TurnSide },
) {
  if (name === "notify_manager") {
    if (!input.chat) return { paused: false, output: JSON.stringify({ ok: false, error: "Уведомление менеджера здесь недоступно." }) };
    const result = await runNotifyManager(args, input.chat);
    const reason = readEventReason(args);
    if (input.turn.handoffReason === null) input.turn.handoffReason = reason;
    emitWebhook(
      input.turn,
      {
        event: "agent.handoff",
        status: "handoff",
        message: { role: "system", text: reason || "Перевод на оператора" },
        metadata: { reason: reason || null, paused: result.paused, ok: result.ok },
      },
    );
    return { paused: result.paused, output: JSON.stringify(result) };
  }
  if (name === "check_availability" || name === "book_slot") {
    if (!input.agentId) return { paused: false, output: JSON.stringify({ ok: false, error: "Календарь не привязан к агенту." }) };
    const output = await runCalendarTool(name, args, input.agentId);
    if (name === "book_slot") emitBooked(input.turn, args, output);
    return { paused: false, output };
  }
  if (name.startsWith("booking_")) {
    if (!input.agentId) return { paused: false, output: JSON.stringify({ ok: false, error: "Онлайн-запись не привязана к агенту." }) };
    const output = await runYclientsTool(name, args, input.agentId);
    if (name === "booking_create_record") emitYclientsBooked(input.turn, output);
    return { paused: false, output };
  }
  if (name === "create_payment_link") {
    if (!input.agentId) return { paused: false, output: JSON.stringify({ ok: false, error: "Приём оплат не привязан к агенту." }) };
    const output = await runPaymentTool(args, input.agentId, input.turn.delivery);
    return { paused: false, output };
  }
  return { paused: false, output: JSON.stringify({ ok: false, error: "Неизвестная функция." }) };
}

function publishReply(turn: TurnSide, text: string, pausedByTool: boolean) {
  const reply = text.trim();
  if (reply) {
    emitWebhook(turn, { event: "message.sent", message: { role: "assistant", text: reply }, metadata: {} });
  }
  scheduleAmoSync(turn, reply);
  schedulePipedriveSync(turn, reply);
  scheduleBitrixSync(turn, reply);
  return { text: reply, pausedByTool };
}

function scheduleAmoSync(turn: TurnSide, reply: string) {
  scheduleCrmSync(turn, reply, syncAgentTurnToAmo);
}

function schedulePipedriveSync(turn: TurnSide, reply: string) {
  scheduleCrmSync(turn, reply, syncAgentTurnToPipedrive);
}

function scheduleBitrixSync(turn: TurnSide, reply: string) {
  scheduleCrmSync(turn, reply, syncAgentTurnToBitrix);
}

function scheduleCrmSync(
  turn: TurnSide,
  reply: string,
  sync: (agentId: string, job: {
    channel: string;
    chatId: string;
    clientName: string | null;
    clientPhone: string | null;
    inbound: string;
    reply: string;
    handoffReason: string | null;
  }) => Promise<void>,
) {
  if (!turn.agentId || (!turn.inbound && !reply && turn.handoffReason === null)) return;
  const agentId = turn.agentId;
  const job = {
    channel: turn.delivery.channel,
    chatId: turn.delivery.chatId,
    clientName: turn.delivery.client.name,
    clientPhone: turn.delivery.client.phone,
    inbound: turn.inbound,
    reply,
    handoffReason: turn.handoffReason,
  };
  const run = () => {
    void sync(agentId, job);
  };
  try {
    after(run);
  } catch {
    run();
  }
}

function emitWebhook(
  turn: TurnSide,
  input: {
    event: string;
    message: { role: "user" | "assistant" | "system"; text: string };
    metadata: Record<string, unknown>;
    status?: "active" | "handoff";
  },
) {
  if (!turn.target) return;
  const target = turn.target;
  const payload = {
    event: input.event,
    status: input.status,
    channel: turn.delivery.channel,
    chat_id: turn.delivery.chatId,
    client: turn.delivery.client,
    message: input.message,
    metadata: input.metadata,
  };
  // После ответа клиенту: 5-секундный таймаут приёмника не задерживает реплику.
  try {
    after(() => {
      void dispatchAgentWebhook(target, payload);
    });
  } catch {
    void dispatchAgentWebhook(target, payload);
  }
}

function emitBooked(turn: TurnSide, args: string, output: string) {
  let parsed: { ok?: boolean; booked?: unknown } = {};
  try {
    parsed = JSON.parse(output) as { ok?: boolean; booked?: unknown };
  } catch {
    return;
  }
  if (!parsed.ok) return;
  emitWebhook(turn, {
    event: "appointment.booked",
    message: { role: "system", text: "Запись создана" },
    metadata: { slot: readJson(args), booked: parsed.booked ?? null },
  });
}

function emitYclientsBooked(turn: TurnSide, output: string) {
  let parsed: { ok?: boolean; recordId?: unknown; datetime?: unknown; phone?: unknown; service?: unknown; staff?: unknown } = {};
  try {
    parsed = JSON.parse(output) as typeof parsed;
  } catch {
    return;
  }
  if (!parsed.ok) return;
  emitWebhook(turn, {
    event: "appointment.booked",
    message: { role: "system", text: "Запись создана" },
    metadata: {
      service: parsed.service ?? null,
      staff: parsed.staff ?? null,
      datetime: parsed.datetime ?? null,
      phone: parsed.phone ?? null,
      record_id: parsed.recordId ?? null,
    },
  });
}

function resolveDelivery(input: { agentId: string | null; chat: NotifyChat | null; delivery?: AgentTurnDelivery }) {
  if (input.delivery) {
    return {
      channel: input.delivery.channel.trim() || "sandbox",
      chatId: input.delivery.chatId.trim(),
      client: {
        name: textOrNull(input.delivery.client?.name),
        phone: textOrNull(input.delivery.client?.phone),
        username: textOrNull(input.delivery.client?.username),
      },
    };
  }
  if (input.chat) return deliveryFromChat(input.chat);
  return {
    channel: "sandbox",
    chatId: input.agentId ?? "",
    client: { name: null, phone: null, username: null },
  };
}

function deliveryFromChat(chat: NotifyChat) {
  const handle = chat.clientHandle.trim();
  const phone = phoneFromHandle(handle) || null;
  const username = handle.startsWith("@")
    ? handle
    : chat.channel === "instagram" && handle && !phone
      ? handle
      : chat.channel === "telegram" && /^[A-Za-z0-9_]{5,}$/.test(handle)
        ? `@${handle}`
        : null;
  return {
    channel: chat.channel,
    chatId: chat.conversationId,
    client: { name: textOrNull(chat.clientName), phone, username },
  };
}

function lastUserText(messages: OpenAI.Chat.ChatCompletionMessageParam[]) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "user") continue;
    const text = messageContent(message.content);
    if (text) return cleanClientText(text);
  }
  return "";
}

function messageContent(content: OpenAI.Chat.ChatCompletionMessageParam["content"]) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n")
    .trim();
}

/** Telegram добавляет служебную строку перед текстом клиента. В CRM уходит исходное сообщение. */
function cleanClientText(text: string) {
  return text.replace(/^\[[^\]]*\]\s*\nСообщение клиента:\s*/u, "").trim();
}

function readEventReason(args: string) {
  const parsed = readJson(args);
  return typeof parsed.event_reason === "string" ? parsed.event_reason.trim() : "";
}

function readJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function textOrNull(value: string | null | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
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
