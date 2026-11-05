/** Общие типы и константы SMM (без server-only: используются и на клиенте). */

export const SMM_TONES = ["friendly", "expert", "bold", "premium", "playful"] as const;
export const SMM_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type SmmStrategyState = {
  description: string;
  tone: string;
  days: string[];
  time: string;
};

/** AI-Студия: платформа использует мастер-ключи, пользователь тратит кредиты генераций. */
export type SmmStudioState = {
  avatarId: string;
  /** Оставшиеся генерации видео (profiles.video_credits). */
  credits: number;
};
export const DEFAULT_SMM_STRATEGY: SmmStrategyState = {
  description: "",
  tone: "friendly",
  days: ["mon", "wed", "fri"],
  time: "12:00",
};

export const EMPTY_SMM_STUDIO: SmmStudioState = { avatarId: "", credits: 0 };

export type SmmPostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed";

export type SmmPostItem = {
  id: string;
  text: string;
  status: SmmPostStatus;
  scheduledTime: string | null;
  hasMedia: boolean;
};
