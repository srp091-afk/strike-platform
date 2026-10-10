export const AGENT_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"] as const;

export type AgentModel = (typeof AGENT_MODELS)[number];

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
  created_at: string;
};

export function isAgentModel(value: string): value is AgentModel {
  return AGENT_MODELS.includes(value as AgentModel);
}
