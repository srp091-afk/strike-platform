/** Matches the brief / style-studio pricing plaque. */
export const CREDITS_PER_CREATIVE = 10;
export const USD_PER_CREATIVE = 0.4;

/** Placeholder until profiles store a real wallet balance. */
export const DEFAULT_CREDITS_BALANCE = 500;

export function creditsForCreatives(count: number) {
  return Math.max(0, Math.floor(count)) * CREDITS_PER_CREATIVE;
}

export function usdForCreatives(count: number) {
  return (Math.max(0, Math.floor(count)) * USD_PER_CREATIVE).toFixed(2);
}

export function creditsLabel(count: number) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return "кредитов";
  if (n1 === 1) return "кредит";
  if (n1 >= 2 && n1 <= 4) return "кредита";
  return "кредитов";
}
