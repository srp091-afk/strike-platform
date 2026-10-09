export const AGENT_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"] as const;

export type AgentModel = (typeof AGENT_MODELS)[number];

export type AgentRecord = {
  id: string;
  name: string;
  system_prompt: string;
  model: string;
  temperature: number;
  is_active: boolean;
  created_at: string;
};

export function isAgentModel(value: string): value is AgentModel {
  return AGENT_MODELS.includes(value as AgentModel);
}
