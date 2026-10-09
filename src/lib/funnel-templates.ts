export type FunnelWidgets = {
  carousel: boolean;
  budget: boolean;
  area: boolean;
};

export type FunnelStyle = {
  id: string;
  name: string;
  tone: string;
  ink: string;
};

export type FunnelTemplate = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  welcome: string;
  previewCampaign: string;
  previewContent: string;
  widgets: FunnelWidgets;
  styles: FunnelStyle[];
  budgets: string[];
  areas: string[];
  whatsappPhone: string;
  whatsappTemplate: string;
};

const INTERIOR_STYLES: FunnelStyle[] = [
  { id: "modern", name: "Modern", tone: "bg-gradient-to-br from-zinc-600 to-zinc-900", ink: "text-white" },
  { id: "brutalism", name: "Brutalism", tone: "bg-gradient-to-br from-stone-400 to-stone-600", ink: "text-white" },
  { id: "classic", name: "Classic", tone: "bg-gradient-to-br from-amber-700 to-stone-800", ink: "text-white" },
  { id: "minimal", name: "Minimal", tone: "bg-gradient-to-br from-zinc-100 to-zinc-300", ink: "text-zinc-800" },
];

const BUDGETS = ["$100k–$250k", "$250k–$500k", "$500k+"];
const AREAS = ["до 80 м²", "80–200 м²", "200+ м²"];

export const FUNNEL_TEMPLATES: FunnelTemplate[] = [
  {
    id: "fitout",
    slug: "fitout-calculator",
    title: "Калькулятор Фит-аута & Ремонта",
    summary: "Быстрое выявление площади, стиля интерьера и сметы.",
    welcome:
      "Привет! По кампании #UTM_CAMPAIGN посчитаем фит-аут за 3 шага: площадь, стиль и смета.",
    previewCampaign: "fitout_calc",
    previewContent: "instagram",
    widgets: { carousel: true, budget: true, area: true },
    styles: INTERIOR_STYLES,
    budgets: BUDGETS,
    areas: AREAS,
    whatsappPhone: "7103507814",
    whatsappTemplate:
      "Привет! Я выбрал стиль #STYLE, площадь #AREA и бюджет #BUDGET. Хочу черновой расчёт фит-аута.",
  },
  {
    id: "villa",
    slug: "villa-picker",
    title: "Подбор Виллы & Недвижимости",
    summary: "Квалификация покупателя по локации и бюджету.",
    welcome:
      "Привет! Вижу, вас интересуют #UTM_CAMPAIGN. Давайте рассчитаем предварительную смету за 3 шага.",
    previewCampaign: "dubai_villas",
    previewContent: "meta_ads",
    widgets: { carousel: true, budget: true, area: false },
    styles: INTERIOR_STYLES,
    budgets: BUDGETS,
    areas: AREAS,
    whatsappPhone: "7103507814",
    whatsappTemplate: "Привет! Я выбрал стиль #STYLE и бюджет #BUDGET. Хочу черновой расчёт.",
  },
  {
    id: "roi",
    slug: "roi-offer",
    title: "Оценка ROI & B2B Оффер",
    summary: "Сбор требований бизнеса и расчёт окупаемости.",
    welcome:
      "Здравствуйте! По запросу #UTM_CAMPAIGN соберём требования и посчитаем окупаемость. Источник: #UTM_CONTENT.",
    previewCampaign: "b2b_roi",
    previewContent: "linkedin",
    widgets: { carousel: false, budget: true, area: false },
    styles: INTERIOR_STYLES,
    budgets: BUDGETS,
    areas: AREAS,
    whatsappPhone: "7103507814",
    whatsappTemplate: "Здравствуйте! Бюджет проекта #BUDGET. Хочу оценку ROI.",
  },
];

const CAMPAIGN_LABELS: Record<string, string> = {
  dubai_villas: "виллы в Дубае",
  fitout_calc: "ремонт и фит-аут",
  b2b_roi: "оценка окупаемости",
};

export const FUNNEL_PUBLIC_ORIGIN = "https://strike-platform.vercel.app";

export function getFunnelTemplate(id: string) {
  return FUNNEL_TEMPLATES.find((template) => template.id === id) ?? FUNNEL_TEMPLATES[0];
}

export function getFunnelTemplateBySlug(slug: string) {
  return FUNNEL_TEMPLATES.find((template) => template.slug === slug) ?? null;
}

export function personalizeWelcome(template: string, campaign: string, content: string) {
  return template
    .replaceAll("#UTM_CAMPAIGN", campaignPhrase(campaign))
    .replaceAll("#UTM_CONTENT", content.trim() || "этот источник");
}

export function buildWhatsAppText(
  template: string,
  widgets: FunnelWidgets,
  picks: { style?: string; budget?: string; area?: string },
) {
  return template
    .replaceAll("#STYLE", widgets.carousel ? picks.style || "не выбран" : "")
    .replaceAll("#BUDGET", widgets.budget ? picks.budget || "не указан" : "")
    .replaceAll("#AREA", widgets.area ? picks.area || "не указана" : "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

export function buildWhatsAppLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function funnelPublicUrl(
  slug: string,
  query: { utmCampaign?: string; utmContent?: string; agentId?: string },
) {
  const url = new URL(`/f/${slug}`, FUNNEL_PUBLIC_ORIGIN);
  if (query.utmCampaign?.trim()) url.searchParams.set("utm_campaign", query.utmCampaign.trim());
  if (query.utmContent?.trim()) url.searchParams.set("utm_content", query.utmContent.trim());
  if (query.agentId) url.searchParams.set("agent", query.agentId);
  return url.toString();
}

function campaignPhrase(value: string) {
  const key = value.trim();
  if (!key) return "ваш запрос";
  return CAMPAIGN_LABELS[key] ?? key.replaceAll("_", " ");
}
