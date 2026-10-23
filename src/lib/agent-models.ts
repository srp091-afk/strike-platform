export const AGENT_MODELS = [
  { value: "gpt-4o-mini", label: "Базовая" },
  { value: "gpt-4o", label: "Продвинутая" },
  { value: "gpt-6-astra", label: "GPT-6 Astra" },
  { value: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
] as const;

export type AgentModel = (typeof AGENT_MODELS)[number]["value"];

export const DEFAULT_AGENT_MODEL: AgentModel = "gpt-4o";

export function normalizeAgentModel(value: unknown): AgentModel {
  if (typeof value === "string" && isAgentModel(value)) return value;
  return DEFAULT_AGENT_MODEL;
}

export type ActiveChannels = {
  whatsapp: boolean;
  telegram: boolean;
  instagram: boolean;
  /** Веб-виджет подключён (инициализирован) для агента. */
  widget: boolean;
};

/**
 * Новый агент: ни один канал ещё физически не подключён, поэтому все тумблеры
 * строго выключены (wa_is_active в БД при создании тоже остаётся false —
 * saveAgent ставит его только вместе с реальными кредами WhatsApp).
 */
export const DEFAULT_ACTIVE_CHANNELS: ActiveChannels = {
  whatsapp: false,
  telegram: false,
  instagram: false,
  widget: false,
};

export function readActiveChannels(value: unknown): ActiveChannels {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_ACTIVE_CHANNELS };
  }

  const record = value as Record<string, unknown>;
  return {
    whatsapp: record.whatsapp === true,
    telegram: record.telegram === true,
    instagram: record.instagram === true,
    widget: record.widget === true,
  };
}

/** Способ подключения Telegram: обычный бот (@BotFather) или личный аккаунт (MTProto). */
export type TelegramType = "bot" | "userbot";

export const TELEGRAM_TYPES: { value: TelegramType; label: string }[] = [
  { value: "bot", label: "Telegram Bot" },
  { value: "userbot", label: "Личный аккаунт" },
];

export function readTelegramType(value: unknown): TelegramType {
  return value === "userbot" ? "userbot" : "bot";
}

/**
 * Конфигурация канала Telegram в таблице `agents`.
 * Для `bot` заполняется только `telegram_bot_token`, для `userbot` —
 * `telegram_phone` + `telegram_api_id` + `telegram_api_hash`.
 */
export type TelegramConfig = {
  telegram_type: TelegramType;
  telegram_bot_token: string | null;
  telegram_phone: string | null;
  telegram_api_id: string | null;
  telegram_api_hash: string | null;
  /** StringSession GramJS после успешного MTProto-входа (секрет, равен доступу к аккаунту). */
  telegram_session: string | null;
};

export const WIDGET_POSITIONS = ["bottom-right", "bottom-center", "bottom-left"] as const;
export type WidgetPosition = (typeof WIDGET_POSITIONS)[number];

export function readWidgetPosition(value: unknown): WidgetPosition {
  return WIDGET_POSITIONS.includes(value as WidgetPosition) ? (value as WidgetPosition) : "bottom-right";
}

/** Настройки веб-виджета чата на сайте клиента. */
export type WidgetSettings = {
  widget_position: WidgetPosition;
  widget_agent_name: string;
  widget_operator_name: string;
  widget_auto_open: boolean;
  widget_open_delay: number;
  widget_color_header_bg: string;
  widget_color_header_text: string;
  widget_greeting: string;
  widget_avatar_agent: string | null;
  widget_avatar_operator: string | null;
};

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  widget_position: "bottom-right",
  widget_agent_name: "AI-Ассистент",
  widget_operator_name: "Менеджер",
  widget_auto_open: false,
  widget_open_delay: 5,
  widget_color_header_bg: "#171717",
  widget_color_header_text: "#f5f5f5",
  widget_greeting: "Здравствуйте! Я — AI-ассистент. Готов ответить на ваши вопросы.",
  widget_avatar_agent: null,
  widget_avatar_operator: null,
};

export function readWidgetText(value: unknown, fallback: string, maxLength = 120): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || fallback;
}

export function readWidgetDelay(value: unknown): number {
  const delay = Number(value);
  if (!Number.isFinite(delay)) return DEFAULT_WIDGET_SETTINGS.widget_open_delay;
  return Math.min(60, Math.max(1, Math.round(delay)));
}

export function readWidgetColor(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallback;
}

export function readWidgetAvatar(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Собрать WidgetSettings из плоских колонок widget_* строки агента. */
export function readWidgetSettings(source: Record<string, unknown> | null | undefined): WidgetSettings {
  const row = source ?? {};
  return {
    widget_position: readWidgetPosition(row.widget_position),
    widget_agent_name: readWidgetText(row.widget_agent_name, DEFAULT_WIDGET_SETTINGS.widget_agent_name),
    widget_operator_name: readWidgetText(row.widget_operator_name, DEFAULT_WIDGET_SETTINGS.widget_operator_name),
    widget_auto_open: row.widget_auto_open === true,
    widget_open_delay: readWidgetDelay(row.widget_open_delay),
    widget_color_header_bg: readWidgetColor(row.widget_color_header_bg, DEFAULT_WIDGET_SETTINGS.widget_color_header_bg),
    widget_color_header_text: readWidgetColor(row.widget_color_header_text, DEFAULT_WIDGET_SETTINGS.widget_color_header_text),
    widget_greeting: readWidgetText(row.widget_greeting, DEFAULT_WIDGET_SETTINGS.widget_greeting, 1000),
    widget_avatar_agent: readWidgetAvatar(row.widget_avatar_agent),
    widget_avatar_operator: readWidgetAvatar(row.widget_avatar_operator),
  };
}

export type AgentRecord = {
  id: string;
  name: string;
  system_prompt: string;
  model: string;
  temperature: number;
  is_active: boolean;
  active_channels: ActiveChannels;
  response_delay: number;
  human_handoff_duration: HandoffDuration;
  limit_agent_messages: number;
  limit_client_messages: number;
  limit_total_messages: number;
  split_messages: boolean;
  waInstanceId: string | null;
  waApiToken: string | null;
  waPhoneNumber: string | null;
  waIsActive: boolean;
  tgBotUsername: string | null;
  tgIsActive: boolean;
  telegram_type: TelegramType;
  telegram_bot_token: string | null;
  telegram_phone: string | null;
  telegram_api_id: string | null;
  telegram_api_hash: string | null;
  telegram_session: string | null;
  telegram_chat_id: string | null;
  widget_position: WidgetPosition;
  widget_agent_name: string;
  widget_operator_name: string;
  widget_auto_open: boolean;
  widget_open_delay: number;
  widget_color_header_bg: string;
  widget_color_header_text: string;
  widget_greeting: string;
  widget_avatar_agent: string | null;
  widget_avatar_operator: string | null;
  created_at: string;
};

/** Подпись подключённого Telegram-канала: @username бота или номер личного аккаунта. */
export function telegramChannelLabel(
  agent: Pick<AgentRecord, "telegram_type" | "telegram_phone" | "telegram_session" | "tgBotUsername" | "telegram_bot_token">,
): string | null {
  if (agent.telegram_type === "userbot") {
    // Личный аккаунт считается подключённым только после MTProto-входа (есть сессия).
    return agent.telegram_phone && agent.telegram_session ? agent.telegram_phone : null;
  }
  if (agent.tgBotUsername) {
    const username = agent.tgBotUsername.replace(/^@/, "");
    return username ? `@${username}` : null;
  }
  return agent.telegram_bot_token ? "Telegram Bot" : null;
}

export function isTelegramConnected(
  agent: Pick<AgentRecord, "telegram_type" | "telegram_phone" | "telegram_session" | "tgBotUsername" | "telegram_bot_token">,
): boolean {
  return telegramChannelLabel(agent) !== null;
}

export const HANDOFF_DURATIONS = [
  { value: "1_hour", label: "1 час" },
  { value: "3_hours", label: "3 часа" },
  { value: "24_hours", label: "24 часа" },
  { value: "forever", label: "Бессрочно, до ручного включения" },
] as const;

export type HandoffDuration = (typeof HANDOFF_DURATIONS)[number]["value"];

export function readHandoffDuration(value: unknown): HandoffDuration {
  if (value === "1_hour" || value === "3_hours" || value === "24_hours" || value === "forever") {
    return value;
  }
  return "1_hour";
}

export function handoffPauseUntil(duration: HandoffDuration, now = Date.now()) {
  if (duration === "forever") {
    const date = new Date(now);
    date.setUTCFullYear(date.getUTCFullYear() + 100);
    return date.toISOString();
  }
  const hours = duration === "1_hour" ? 1 : duration === "3_hours" ? 3 : 24;
  return new Date(now + hours * 60 * 60 * 1000).toISOString();
}

export function isBotPauseActive(until: unknown, now = Date.now()) {
  if (until == null || until === "") return false;
  const time = Date.parse(String(until));
  return Number.isFinite(time) && time > now;
}

export function readMessageLimit(value: unknown) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit < 0) return 0;
  return Math.round(limit);
}

export function readResponseDelay(value: unknown) {
  const delay = Number(value);
  if (!Number.isFinite(delay) || delay < 0) return 0;
  return Math.round(delay);
}

export function readSplitMessages(value: unknown) {
  return value === true || value === "true";
}

export function isAgentModel(value: string): value is AgentModel {
  return AGENT_MODELS.some((model) => model.value === value);
}
