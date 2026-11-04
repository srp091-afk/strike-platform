/** Общие типы и константы SMM (без server-only: используются и на клиенте). */

export const SMM_TONES = ["friendly", "expert", "bold", "premium", "playful"] as const;
export const SMM_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type SmmKeyField = "heygen" | "runway" | "elevenlabs";

export type SmmStrategyState = {
  description: string;
  tone: string;
  days: string[];
  time: string;
};

/** Ключи клиенту не отдаются: только маска («••••abcd») или пустая строка, если ключа нет. */
export type SmmIntegrationsState = {
  heygen: string;
  runway: string;
  elevenlabs: string;
  avatarId: string;
};

export const DEFAULT_SMM_STRATEGY: SmmStrategyState = {
  description: "",
  tone: "friendly",
  days: ["mon", "wed", "fri"],
  time: "12:00",
};

export const EMPTY_SMM_INTEGRATIONS: SmmIntegrationsState = {
  heygen: "",
  runway: "",
  elevenlabs: "",
  avatarId: "",
};

export function maskSecret(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  return `••••••••${value.slice(-4)}`;
}
