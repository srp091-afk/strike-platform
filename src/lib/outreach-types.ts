/** Типы и константы модуля «Рассылки». Без серверных импортов: используются и в клиентских компонентах. */

export type OutreachStatus = "draft" | "active" | "paused" | "completed";
export type OutreachChannel = "whatsapp" | "telegram" | "instagram";
export type OutreachLogStatus = "queued" | "success" | "error";

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
};

export function readOutreachChannel(value: unknown): OutreachChannel | null {
  return value === "whatsapp" || value === "telegram" || value === "instagram" ? value : null;
}

export function readOutreachStatus(value: unknown): OutreachStatus {
  return value === "active" || value === "paused" || value === "completed" ? value : "draft";
}
