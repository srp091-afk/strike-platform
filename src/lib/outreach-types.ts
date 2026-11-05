/** Типы и константы модуля «Рассылки». Без серверных импортов: используются и в клиентских компонентах. */

export type OutreachStatus = "draft" | "active" | "paused" | "completed";
export type OutreachChannel = "whatsapp" | "telegram" | "instagram";
export type OutreachLogStatus = "queued" | "success" | "error";
export type OutreachMessageType = "ai" | "fixed";
export type OutreachDelayMode = "random" | "fixed";

export const OUTREACH_CHANNELS: ReadonlyArray<{ value: OutreachChannel; label: string }> = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "telegram", label: "Telegram" },
  { value: "instagram", label: "Instagram" },
];

export const OUTREACH_STATUS_LABEL: Record<OutreachStatus, string> = {
  draft: "Черновик",
  active: "В работе",
  paused: "Пауза",
  completed: "Завершена",
};

export const OUTREACH_MAX_ROWS = 5000;

export const OUTREACH_LANGUAGES = [
  "Русский",
  "Английский",
  "Испанский",
  "Немецкий",
  "Французский",
  "Итальянский",
  "Португальский",
  "Арабский",
  "Турецкий",
  "Польский",
  "Украинский",
  "Китайский",
] as const;
export const DEFAULT_OUTREACH_LANGUAGE = "Русский";

export type OutreachCampaign = {
  id: string;
  name: string;
  agent_id: string | null;
  channel_type: OutreachChannel | null;
  outreach_prompt: string;
  min_delay_minutes: number;
  max_delay_minutes: number;
  daily_limit: number;
  status: OutreachStatus;
  source_columns: string[];
  contact_column: string | null;
  website_column: string | null;
  name_column: string | null;
  social_column: string | null;
  message_type: OutreachMessageType;
  fixed_message: string;
  language: string;
  delay_mode: OutreachDelayMode;
  fixed_delay_minutes: number;
  webhook_url: string | null;
  created_at: string;
};

export type OutreachCounts = { total: number; sent: number; failed: number };

export type OutreachCampaignCard = OutreachCampaign &
  OutreachCounts & {
    agent_name: string | null;
  };

export type OutreachLog = {
  id: string;
  row_index: number;
  contact_data: Record<string, string>;
  strike_status: OutreachLogStatus;
  strike_sent_time: string | null;
  strike_message: string | null;
  strike_error: string | null;
};

/** Агент для селекта: каналы уже отфильтрованы до реально подключённых и включённых. */
export type OutreachAgentOption = {
  id: string;
  name: string;
  channels: OutreachChannel[];
  /** Подключённый аккаунт-отправитель по каналам: номер WhatsApp, @бот Telegram. */
  accounts: Partial<Record<OutreachChannel, string>>;
};

export function readOutreachChannel(value: unknown): OutreachChannel | null {
  return value === "whatsapp" || value === "telegram" || value === "instagram" ? value : null;
}

export function readOutreachStatus(value: unknown): OutreachStatus {
  return value === "active" || value === "paused" || value === "completed" ? value : "draft";
}

export type OutreachMapping = {
  contact: string | null;
  website: string | null;
  name: string | null;
  social: string | null;
};

const VARIABLE_ALIASES: Array<{ pattern: RegExp; key: keyof OutreachMapping }> = [
  { pattern: /^(имя|name|first_?name)$/i, key: "name" },
  { pattern: /^(сайт|site|website|url)$/i, key: "website" },
  { pattern: /^(соцсети|соцсеть|social|socials)$/i, key: "social" },
  { pattern: /^(телефон|номер|контакт|phone|contact|email|e-?mail)$/i, key: "contact" },
];

/**
 * Подставляет {{Переменные}} в «точный текст». Сначала проверяются алиасы колонок из маппинга
 * ({{Имя}}, {{Сайт}}, {{Соцсети}}, {{Телефон}}), затем точное название любой колонки базы.
 * Неизвестная переменная заменяется пустой строкой, чтобы {{...}} никогда не попал клиенту.
 */
export function renderFixedMessage(template: string, contact: Record<string, string>, mapping: OutreachMapping) {
  return template
    .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, raw: string) => {
      const variable = raw.trim();
      const alias = VARIABLE_ALIASES.find((item) => item.pattern.test(variable));
      const mapped = alias ? mapping[alias.key] : null;
      if (mapped && contact[mapped] !== undefined) return contact[mapped].trim();
      if (contact[variable] !== undefined) return contact[variable].trim();
      const insensitive = Object.keys(contact).find((column) => column.toLowerCase() === variable.toLowerCase());
      return insensitive ? contact[insensitive].trim() : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.!?;:])/g, "$1")
    .trim();
}
