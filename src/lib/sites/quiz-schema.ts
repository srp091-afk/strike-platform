export type ThemePreset = "dark_premium" | "light_minimal" | "editorial_warm";

export type QuizOption = {
  id: string;
  label: string;
  description: string;
  imageUrl: string;
  nextStepId: string | null;
  priceImpact: number;
};

export type SliderConfig = {
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
};

export type QuizStepType = "single_choice" | "multi_choice" | "image_cards" | "range_slider" | "text_input";

export type QuizStep = {
  id: string;
  order: number;
  title: string;
  subtitle: string;
  required: boolean;
  type: QuizStepType;
  options: QuizOption[];
  sliderConfig: SliderConfig;
  placeholder: string;
  expertTip: string;
};

export type QuizSchema = {
  startScreen: {
    enabled: boolean;
    layout: "centered" | "split_image";
    eyebrow: string;
    headline: string;
    subheadline: string;
    ctaText: string;
    bonusBadge: string;
    trustLine: string;
    imageUrl: string;
  };
  steps: QuizStep[];
  calculator: { enabled: boolean; basePrice: number; currency: string; label: string };
  leadScreen: {
    headline: string;
    subheadline: string;
    bonusText: string;
    ctaText: string;
    askName: boolean;
    askPhone: boolean;
    askEmail: boolean;
    askMessenger: boolean;
    messengers: Array<"whatsapp" | "telegram" | "phone">;
    privacyText: string;
  };
  thankYouScreen: {
    headline: string;
    subheadline: string;
    showSummary: boolean;
    primaryAction: { label: string; url: string; type: "whatsapp" | "telegram" | "link" | "none" };
  };
  hideBranding: boolean;
};

export type ThemeConfig = {
  preset: ThemePreset;
  accentColor: string;
  fontFamily: string;
  borderRadius: number;
  logoUrl: string;
};

export type AnalyticsConfig = {
  metaPixelId: string;
  ga4Id: string;
  yandexMetrikaId: string;
  tiktokPixelId: string;
  headCode: string;
  syncLeads: boolean;
  whatsapp: string;
  telegram: string;
};

export type SeoConfig = {
  title: string;
  description: string;
  ogImageUrl: string;
  faviconUrl: string;
};

const STEP_TYPES: QuizStepType[] = ["single_choice", "multi_choice", "image_cards", "range_slider", "text_input"];

export function defaultTheme(preset: ThemePreset = "dark_premium"): ThemeConfig {
  return { preset, accentColor: "#cf0234", fontFamily: "Inter", borderRadius: 16, logoUrl: "" };
}

export function emptyAnalytics(): AnalyticsConfig {
  return {
    metaPixelId: "",
    ga4Id: "",
    yandexMetrikaId: "",
    tiktokPixelId: "",
    headCode: "",
    syncLeads: true,
    whatsapp: "",
    telegram: "",
  };
}

export function emptySeo(title = ""): SeoConfig {
  return { title, description: "", ogImageUrl: "", faviconUrl: "" };
}

export function blankQuiz(title = "Новый квиз"): QuizSchema {
  return {
    startScreen: {
      enabled: true,
      layout: "centered",
      eyebrow: "2 минуты",
      headline: title,
      subheadline: "Ответьте на несколько вопросов. Мы посчитаем ориентир и свяжемся с вами.",
      ctaText: "Начать",
      bonusBadge: "",
      trustLine: "Без обязательств",
      imageUrl: "",
    },
    steps: [
      step("budget", 0, "Какой бюджет вы рассматриваете?", "single_choice", ["До 1 млн", "1–3 млн", "3–8 млн", "От 8 млн"]),
      step("timing", 1, "Когда планируете начать?", "single_choice", ["В этом месяце", "В этом квартале", "Просто сравниваю"]),
      step("goal", 2, "Что для вас главное?", "single_choice", ["Цена", "Срок", "Качество", "Под ключ"]),
    ],
    calculator: { enabled: false, basePrice: 0, currency: "₽", label: "Ориентир" },
    leadScreen: {
      headline: "Куда отправить результат?",
      subheadline: "Менеджер напишет с конкретным следующим шагом.",
      bonusText: "",
      ctaText: "Получить расчёт",
      askName: true,
      askPhone: true,
      askEmail: false,
      askMessenger: true,
      messengers: ["whatsapp", "telegram", "phone"],
      privacyText: "Нажимая кнопку, вы соглашаетесь на обработку контакта.",
    },
    thankYouScreen: {
      headline: "Заявка принята",
      subheadline: "Мы уже смотрим ответы и скоро напишем.",
      showSummary: true,
      primaryAction: { label: "", url: "", type: "none" },
    },
    hideBranding: false,
  };
}

function step(id: string, order: number, title: string, type: QuizStepType, labels: string[]): QuizStep {
  return {
    id,
    order,
    title,
    subtitle: "",
    required: true,
    type,
    options: labels.map((label, index) => option(`${id}-${index + 1}`, label)),
    sliderConfig: { min: 0, max: 100, step: 1, unit: "", defaultValue: 20 },
    placeholder: "",
    expertTip: "",
  };
}

function option(id: string, label: string): QuizOption {
  return { id, label, description: "", imageUrl: "", nextStepId: null, priceImpact: 0 };
}

export function newStep(order: number): QuizStep {
  const id = `q-${Math.random().toString(36).slice(2, 8)}`;
  return step(id, order, "Новый вопрос", "single_choice", ["Вариант 1", "Вариант 2", "Вариант 3"]);
}

export function parseQuizSchema(value: unknown): QuizSchema {
  const fallback = blankQuiz();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const record = value as Record<string, unknown>;
  const steps = Array.isArray(record.steps) ? record.steps.map(readStep).filter((item): item is QuizStep => item !== null) : [];
  return {
    startScreen: readStart(record.startScreen, fallback.startScreen),
    steps: (steps.length > 0 ? steps : fallback.steps).slice(0, 12).map((item, index) => ({ ...item, order: index })),
    calculator: readCalculator(record.calculator),
    leadScreen: readLead(record.leadScreen, fallback.leadScreen),
    thankYouScreen: readThanks(record.thankYouScreen, fallback.thankYouScreen),
    hideBranding: record.hideBranding === true,
  };
}

function readStart(value: unknown, fallback: QuizSchema["startScreen"]): QuizSchema["startScreen"] {
  const record = asRecord(value);
  return {
    enabled: record.enabled !== false,
    layout: record.layout === "split_image" ? "split_image" : "centered",
    eyebrow: text(record.eyebrow, fallback.eyebrow),
    headline: text(record.headline, fallback.headline),
    subheadline: text(record.subheadline, fallback.subheadline),
    ctaText: text(record.ctaText, fallback.ctaText),
    bonusBadge: text(record.bonusBadge, ""),
    trustLine: text(record.trustLine, ""),
    imageUrl: text(record.imageUrl, ""),
  };
}

function readStep(value: unknown): QuizStep | null {
  const record = asRecord(value);
  const title = text(record.title, "");
  if (!title) return null;
  const type = STEP_TYPES.find((item) => item === record.type) ?? "single_choice";
  const options = Array.isArray(record.options) ? record.options.map(readOption).filter((item): item is QuizOption => item !== null).slice(0, 8) : [];
  const id = text(record.id, "") || `q-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: id.slice(0, 40),
    order: number(record.order, 0),
    title: title.slice(0, 180),
    subtitle: text(record.subtitle, "").slice(0, 240),
    required: record.required !== false,
    type,
    options: options.length > 0 ? options : [option(`${id}-1`, "Да"), option(`${id}-2`, "Нет")],
    sliderConfig: readSlider(record.sliderConfig),
    placeholder: text(record.placeholder, "").slice(0, 80),
    expertTip: text(record.expertTip, "").slice(0, 180),
  };
}

function readOption(value: unknown): QuizOption | null {
  const record = asRecord(value);
  const label = text(record.label, "");
  if (!label) return null;
  return {
    id: (text(record.id, "") || `o-${Math.random().toString(36).slice(2, 7)}`).slice(0, 40),
    label: label.slice(0, 80),
    description: text(record.description, "").slice(0, 140),
    imageUrl: text(record.imageUrl, ""),
    nextStepId: typeof record.nextStepId === "string" && record.nextStepId ? record.nextStepId.slice(0, 40) : null,
    priceImpact: number(record.priceImpact, 0),
  };
}

function readSlider(value: unknown): SliderConfig {
  const record = asRecord(value);
  const min = number(record.min, 0);
  const max = Math.max(min + 1, number(record.max, 100));
  return {
    min,
    max,
    step: Math.max(1, number(record.step, 1)),
    unit: text(record.unit, "").slice(0, 12),
    defaultValue: number(record.defaultValue, min),
  };
}

function readCalculator(value: unknown): QuizSchema["calculator"] {
  const record = asRecord(value);
  return {
    enabled: record.enabled === true,
    basePrice: Math.max(0, number(record.basePrice, 0)),
    currency: text(record.currency, "₽").slice(0, 8),
    label: text(record.label, "Ориентир").slice(0, 40),
  };
}

function readLead(value: unknown, fallback: QuizSchema["leadScreen"]): QuizSchema["leadScreen"] {
  const record = asRecord(value);
  const messengers = Array.isArray(record.messengers)
    ? record.messengers.filter((item): item is "whatsapp" | "telegram" | "phone" => item === "whatsapp" || item === "telegram" || item === "phone")
    : fallback.messengers;
  return {
    headline: text(record.headline, fallback.headline).slice(0, 140),
    subheadline: text(record.subheadline, fallback.subheadline).slice(0, 220),
    bonusText: text(record.bonusText, "").slice(0, 140),
    ctaText: text(record.ctaText, fallback.ctaText).slice(0, 40),
    askName: record.askName !== false,
    askPhone: record.askPhone !== false,
    askEmail: record.askEmail === true,
    askMessenger: record.askMessenger !== false,
    messengers: messengers.length > 0 ? messengers : fallback.messengers,
    privacyText: text(record.privacyText, fallback.privacyText).slice(0, 220),
  };
}

function readThanks(value: unknown, fallback: QuizSchema["thankYouScreen"]): QuizSchema["thankYouScreen"] {
  const record = asRecord(value);
  const action = asRecord(record.primaryAction);
  const type = action.type === "whatsapp" || action.type === "telegram" || action.type === "link" ? action.type : "none";
  return {
    headline: text(record.headline, fallback.headline).slice(0, 140),
    subheadline: text(record.subheadline, fallback.subheadline).slice(0, 240),
    showSummary: record.showSummary !== false,
    primaryAction: { label: text(action.label, "").slice(0, 40), url: text(action.url, "").slice(0, 300), type },
  };
}

export function parseTheme(value: unknown): ThemeConfig {
  const record = asRecord(value);
  const preset: ThemePreset =
    record.preset === "light_minimal" || record.preset === "editorial_warm" || record.preset === "dark_premium"
      ? record.preset
      : "dark_premium";
  const base = defaultTheme(preset);
  const accent = text(record.accentColor, base.accentColor);
  return {
    preset,
    accentColor: /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : base.accentColor,
    fontFamily: text(record.fontFamily, base.fontFamily).slice(0, 40),
    borderRadius: Math.min(28, Math.max(0, number(record.borderRadius, base.borderRadius))),
    logoUrl: text(record.logoUrl, ""),
  };
}

export function parseAnalytics(value: unknown): AnalyticsConfig {
  const record = asRecord(value);
  const empty = emptyAnalytics();
  return {
    metaPixelId: text(record.metaPixelId, "").slice(0, 40),
    ga4Id: text(record.ga4Id, "").slice(0, 40),
    yandexMetrikaId: text(record.yandexMetrikaId, "").slice(0, 20),
    tiktokPixelId: text(record.tiktokPixelId, "").slice(0, 40),
    headCode: text(record.headCode, "").slice(0, 2000),
    syncLeads: record.syncLeads !== false,
    whatsapp: text(record.whatsapp, "").slice(0, 20),
    telegram: text(record.telegram, "").slice(0, 40),
  };
}

export function parseSeo(value: unknown, title = ""): SeoConfig {
  const record = asRecord(value);
  return {
    title: text(record.title, title).slice(0, 80),
    description: text(record.description, "").slice(0, 180),
    ogImageUrl: text(record.ogImageUrl, ""),
    faviconUrl: text(record.faviconUrl, ""),
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function number(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
