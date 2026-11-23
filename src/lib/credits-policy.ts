/** Минимум за один ответ агента. Сверх этого — 1 SC за каждую 1000 токенов. */
export const AGENT_REPLY_MIN_SC = 2;
export const CREDITS_LOW_SC = 50;
export const CREDITS_EMPTY_MESSAGE =
  "Закончились STRIKE Credits. Пополните баланс или выберите тариф, чтобы продолжить работу агентов.";

export function agentReplyCost(totalTokens: number | null) {
  if (totalTokens == null || !Number.isFinite(totalTokens) || totalTokens <= 0) return AGENT_REPLY_MIN_SC;
  return Math.max(AGENT_REPLY_MIN_SC, Math.ceil(totalTokens / 1000));
}
