/**
 * Price ID Paddle Billing. Ключи тарифов совпадают с `planKey()` в billing-catalog.
 * Старую цену в Paddle нельзя изменить, поэтому AI-Агенты читают новые ID из env.
 * Чекаут в браузере видит только NEXT_PUBLIC_*, вебхук — оба имени.
 */
function paddlePrice(serverValue: string | undefined, publicValue: string | undefined, placeholder: string) {
  const value = (publicValue || serverValue || "").trim();
  return value || placeholder;
}
export const PADDLE_CREDIT_PACKS = [
  { credits: 1000, usd: 10, priceId: "pri_credits_1000" },
  { credits: 5000, usd: 45, priceId: "pri_credits_5000" },
  { credits: 15000, usd: 120, priceId: "pri_credits_15000" },
] as const;

export const PADDLE_CREDIT_PRICE_IDS: Record<number, string> = Object.fromEntries(
  PADDLE_CREDIT_PACKS.map((pack) => [pack.credits, pack.priceId]),
);

export type PaddlePlan = {
  priceId: string;
  /** SC, которые начисляются за оплаченный период. 0 — тариф без кредитов. */
  credits: number;
  usd: number;
  /** Колонки profiles, которые включает этот тариф. */
  patch: Record<string, string | boolean>;
};

export const PADDLE_PLANS: Record<string, PaddlePlan> = {
  agents_start: {
    priceId: paddlePrice(process.env.PADDLE_PRICE_START_49, process.env.NEXT_PUBLIC_PADDLE_PRICE_START_49, "PADDLE_PRICE_START_49"),
    credits: 5000,
    usd: 49,
    patch: { tier_agents: "start" },
  },
  agents_pro: {
    priceId: paddlePrice(process.env.PADDLE_PRICE_PRO_99, process.env.NEXT_PUBLIC_PADDLE_PRICE_PRO_99, "PADDLE_PRICE_PRO_99"),
    credits: 12000,
    usd: 99,
    patch: { tier_agents: "pro" },
  },
  agents_agency: {
    priceId: paddlePrice(process.env.PADDLE_PRICE_AGENCY_249, process.env.NEXT_PUBLIC_PADDLE_PRICE_AGENCY_249, "PADDLE_PRICE_AGENCY_249"),
    credits: 35000,
    usd: 249,
    patch: { tier_agents: "agency" },
  },
  smm_start: { priceId: "pri_smm_start", credits: 1000, usd: 19, patch: { tier_smm: "start" } },
  smm_creator: { priceId: "pri_smm_creator", credits: 3000, usd: 39, patch: { tier_smm: "creator" } },
  smm_agency: { priceId: "pri_smm_agency", credits: 8000, usd: 89, patch: { tier_smm: "agency" } },
  ads_start: { priceId: "pri_ads_start", credits: 1500, usd: 29, patch: { tier_ads: "start" } },
  ads_pro: { priceId: "pri_ads_pro", credits: 4000, usd: 59, patch: { tier_ads: "pro" } },
  ads_agency: { priceId: "pri_ads_agency", credits: 12000, usd: 149, patch: { tier_ads: "agency" } },
  sites_basic: { priceId: "pri_sites_basic", credits: 0, usd: 15, patch: { tier_sites: "basic" } },
  sites_pro: { priceId: "pri_sites_pro", credits: 1000, usd: 29, patch: { tier_sites: "pro" } },
  bundle: {
    priceId: "pri_bundle",
    credits: 15000,
    usd: 179,
    patch: {
      is_bundle_active: true,
      tier_agents: "pro",
      tier_smm: "creator",
      tier_ads: "pro",
      tier_sites: "pro",
    },
  },
};

export function creditPackByPriceId(priceId: string): { credits: number; usd: number } | null {
  return PADDLE_CREDIT_PACKS.find((pack) => pack.priceId === priceId) ?? null;
}

/** Старые цены AI-Агентов. Продление по ним начисляет прежние SC, пока подписка не переведена на новую цену. */
const LEGACY_AGENT_PLANS: PaddlePlan[] = [
  { priceId: "pri_agents_start", credits: 2500, usd: 29, patch: { tier_agents: "start" } },
  { priceId: "pri_agents_pro", credits: 8000, usd: 79, patch: { tier_agents: "pro" } },
  { priceId: "pri_agents_agency", credits: 25000, usd: 199, patch: { tier_agents: "agency" } },
];

export function planByPriceId(priceId: string): PaddlePlan | null {
  return (
    Object.values(PADDLE_PLANS).find((plan) => plan.priceId === priceId) ??
    LEGACY_AGENT_PLANS.find((plan) => plan.priceId === priceId) ??
    null
  );
}
