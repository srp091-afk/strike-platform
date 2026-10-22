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
};

export const DEFAULT_ACTIVE_CHANNELS: ActiveChannels = {
  whatsapp: true,
  telegram: false,
  instagram: false,
};

export function readActiveChannels(value: unknown): ActiveChannels {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_ACTIVE_CHANNELS };
  }

  const record = value as Record<string, unknown>;
  return {
    whatsapp: record.whatsapp !== false,
    telegram: record.telegram === true,
    instagram: record.instagram === true,
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
};

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
  telegram_chat_id: string | null;
  created_at: string;
};

/** Подпись подключённого Telegram-канала: @username бота или номер личного аккаунта. */
export function telegramChannelLabel(agent: Pick<AgentRecord, "telegram_type" | "telegram_phone" | "tgBotUsername" | "telegram_bot_token">): string | null {
  if (agent.telegram_type === "userbot") {
    return agent.telegram_phone ? agent.telegram_phone : null;
  }
  if (agent.tgBotUsername) {
    const username = agent.tgBotUsername.replace(/^@/, "");
    return username ? `@${username}` : null;
  }
  return agent.telegram_bot_token ? "Telegram Bot" : null;
}

export function isTelegramConnected(agent: Pick<AgentRecord, "telegram_type" | "telegram_phone" | "tgBotUsername" | "telegram_bot_token">): boolean {
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
