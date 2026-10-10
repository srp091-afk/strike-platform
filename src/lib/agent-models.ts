export const AGENT_MODELS = [
  { value: "gpt-4o-mini", label: "Базовая" },
  { value: "gpt-4o", label: "Продвинутая" },
  { value: "gpt-6-astra", label: "GPT-6 Astra" },
  { value: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
] as const;

export type AgentModel = (typeof AGENT_MODELS)[number]["value"];

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

export type AgentRecord = {
  id: string;
  name: string;
  system_prompt: string;
  model: string;
  temperature: number;
  is_active: boolean;
  active_channels: ActiveChannels;
  response_delay: number;
  created_at: string;
};

export function readResponseDelay(value: unknown) {
  const delay = Number(value);
  if (!Number.isFinite(delay) || delay < 0) return 0;
  return Math.round(delay);
}

export function isAgentModel(value: string): value is AgentModel {
  return AGENT_MODELS.some((model) => model.value === value);
}
