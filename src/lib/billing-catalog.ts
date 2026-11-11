/** Каталог модульных тарифов STRIKE и пакетов STRIKE Credits (SC). Единый источник для /pricing и /dashboard/billing. */

export type ModuleId = "agents" | "smm" | "ads" | "sites" | "bundle";
export type Lang = "en" | "ru";
export type Text2 = Record<Lang, string>;

export type Tier = {
  /** Значение в profiles.tier_* (для bundle — не используется). */
  id: string;
  name: string;
  price: number;
  popular?: boolean;
  features: Text2[];
};

export const MODULE_ORDER: ModuleId[] = ["agents", "smm", "ads", "sites", "bundle"];

export const MODULE_LABELS: Record<ModuleId, Text2> = {
  agents: { ru: "AI-Агенты", en: "AI Agents" },
  smm: { ru: "SMM-Студия", en: "SMM Studio" },
  ads: { ru: "Ads & Креативы", en: "Ads & Creatives" },
  sites: { ru: "Сайты", en: "Websites" },
  bundle: { ru: "Бандл STRIKE Business", en: "STRIKE Business Bundle" },
};

export const MODULE_BLURBS: Record<ModuleId, Text2> = {
  agents: { ru: "Автоматизируйте диалоги и продажи с помощью AI-агентов.", en: "Automate conversations and sales with AI agents." },
  smm: { ru: "Контент-план, AI-видео и публикации для ваших проектов.", en: "Content plans, AI video and publishing for your projects." },
  ads: { ru: "Рекламные кампании и креативы, сгенерированные AI.", en: "AI-generated ad campaigns and creatives." },
  sites: { ru: "AI-лендинги и сайты для вашего бизнеса.", en: "AI landing pages and websites for your business." },
  bundle: { ru: "Всё включено на общем балансе STRIKE Credits.", en: "Everything included on one shared STRIKE Credits balance." },
};

const sc = (n: string): Text2 => ({ ru: `${n} SC в месяц`, en: `${n} SC / month` });

export const TIERS: Record<Exclude<ModuleId, "bundle">, Tier[]> = {
  agents: [
    { id: "start", name: "Start", price: 29, features: [{ ru: "1 AI-агент", en: "1 AI agent" }, sc("2 500")] },
    {
      id: "pro",
      name: "Pro",
      price: 79,
      popular: true,
      features: [{ ru: "5 AI-агентов", en: "5 AI agents" }, { ru: "Голосовой режим", en: "Voice mode" }, sc("8 000")],
    },
    { id: "agency", name: "Agency", price: 199, features: [{ ru: "20 AI-агентов", en: "20 AI agents" }, sc("25 000")] },
  ],
  smm: [
    { id: "start", name: "Start", price: 19, features: [{ ru: "1 проект", en: "1 project" }, sc("1 000")] },
    {
      id: "creator",
      name: "Creator",
      price: 39,
      popular: true,
      features: [{ ru: "3 проекта", en: "3 projects" }, { ru: "AI-видео", en: "AI video" }, sc("3 000")],
    },
    { id: "agency", name: "Agency", price: 89, features: [{ ru: "10 проектов", en: "10 projects" }, sc("8 000")] },
  ],
  ads: [
    { id: "start", name: "Start", price: 29, features: [{ ru: "3 рекламных проекта", en: "3 ad projects" }, sc("1 500")] },
    {
      id: "pro",
      name: "Pro",
      price: 59,
      popular: true,
      features: [{ ru: "10 проектов", en: "10 projects" }, { ru: "Экспорт в ZIP", en: "ZIP export" }, sc("4 000")],
    },
    { id: "agency", name: "Agency", price: 149, features: [{ ru: "Безлимит проектов", en: "Unlimited projects" }, sc("12 000")] },
  ],
  sites: [
    { id: "basic", name: "Basic", price: 15, features: [{ ru: "1 сайт", en: "1 website" }] },
    { id: "pro", name: "Pro", price: 29, popular: true, features: [{ ru: "3 сайта", en: "3 websites" }, sc("1 000")] },
  ],
};

export const BUNDLE: Tier = {
  id: "bundle",
  name: "STRIKE Business",
  price: 179,
  features: [
    { ru: "5 AI-агентов", en: "5 AI agents" },
    { ru: "3 SMM-проекта", en: "3 SMM projects" },
    { ru: "3 сайта", en: "3 websites" },
    { ru: "Уровень Pro для Ads & Креативы", en: "Pro tier for Ads & Creatives" },
    { ru: "15 000 SC в месяц на общий баланс", en: "15,000 SC / month on one shared balance" },
  ],
};

export const BUNDLE_SAVING: Text2 = { ru: "Экономия ~30%", en: "Save ~30%" };

export type TopUp = { credits: number; usd: number; benefit?: string };

/** Базовый курс 100 SC = $1. Скидочные пакеты начисляют больше, чем центы оплаты. */
export const TOP_UPS: TopUp[] = [
  { credits: 1000, usd: 10, benefit: "100 SC = $1" },
  { credits: 5000, usd: 45, benefit: "Выгода 10%" },
  { credits: 15000, usd: 120, benefit: "Выгода 20%" },
];

/** Сколько SC начислить за оплаченный Flex-заказ. Сумма в центах. */
export function creditsForTopUpCents(totalCents: number): number {
  const cents = Math.round(totalCents);
  const pack = TOP_UPS.find((item) => Math.round(item.usd * 100) === cents);
  return pack ? pack.credits : cents;
}

export function formatSc(value: number): string {
  return value.toLocaleString("ru-RU").replace(/\u00a0/g, " ");
}

/** Ключ тарифа для чекаута и env-переменной (agents_pro, smm_creator, bundle). */
export function planKey(module: ModuleId, tierId: string): string {
  return module === "bundle" ? "bundle" : `${module}_${tierId}`;
}

export function tierLabel(tier: string): string {
  if (tier === "trial") return "Trial";
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}