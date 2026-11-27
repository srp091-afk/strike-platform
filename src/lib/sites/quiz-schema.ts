export type ThemePreset = "dark_premium" | "light_minimal" | "editorial_warm";

export type QuizOption = {
  id: string;
  label: string;
  description: string;
  imageUrl: string;
  nextStepId: string | null;
  priceImpact: number;
  numericValue?: number;
};

export type SliderConfig = {
  min: number;
  max: number;
  step: number;
  unit: string;
  defaultValue: number;
};

export type QuizStepType = "single_choice" | "multi_choice" | "image_cards" | "range_slider" | "text_input";

export type ConsultantMode = "text" | "ai_avatar" | "custom_video";
export type HelperMode = "inherit" | ConsultantMode;
export type VoiceStyle = "calm" | "confident" | "friendly";
export type AvatarJobStatus = "idle" | "queued" | "ready" | "provider_pending";
export type VoiceLocale = "ru" | "en" | "es" | "de";

export type QuizConsultant = {
  enabled: boolean;
  defaultMode: ConsultantMode;
  name: string;
  role: string;
  avatarUrl: string | null;
  aiAvatarId: string | null;
  aiVoiceLocale: VoiceLocale;
  showOnLeadScreen: boolean;
};

export type StepHelper = {
  enabled: boolean;
  mode: HelperMode;
  text: string;
  customVideoUrl: string | null;
  customVideoPosterUrl: string | null;
  aiAvatar: {
    avatarId: string | null;
    script: string;
    voiceStyle: VoiceStyle;
    status: AvatarJobStatus;
    videoUrl: string | null;
  };
};

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
  helper: StepHelper;
  variableKey?: string;
  defaultNumericValue?: number;
};

export type StartLayout = "cinematic_hero" | "editorial_split" | "spotlight_center" | "swiss_minimal";
export type HighlightStyle = "badge" | "accent_text" | "underline";
export type BulletIconStyle = "check" | "icon" | "number";
export type BulletLayout = "auto" | "grid_2" | "stack";
export type GiftType = "file" | "link" | "discount";
export type DeliveryChannel = "page" | "messenger" | "email";

export type StartBullet = { id: string; text: string; icon?: string };

export type QuizGift = {
  id: string;
  type: GiftType;
  title: string;
  subtitle: string;
  coverUrl: string | null;
  fileUrl: string | null;
  fileName: string | null;
  actionUrl: string | null;
  actionLabel: string;
};

export type GiftsConfig = {
  showOnStart: boolean;
  showInProgress: boolean;
  showOnThankYou: boolean;
  sectionLabel: string;
  items: QuizGift[];
  deliveryChannel: DeliveryChannel;
  messengerUrl?: string | null;
  emailNote?: string | null;
};

export type StartScreen = {
  enabled: boolean;
  layout: StartLayout;
  brand: { show: boolean; name?: string; logoUrl?: string };
  eyebrow: { show: boolean; text: string };
  trustBadge: { show: boolean; primaryText: string; secondaryText?: string };
  headline: string;
  highlightStyle: HighlightStyle;
  subheadline: { show: boolean; text: string };
  bullets: { show: boolean; iconStyle: BulletIconStyle; layout: BulletLayout; items: StartBullet[] };
  ctaText: string;
  ctaMicroText: { show: boolean; text: string };
  media: {
    type: "none" | "image" | "video";
    url: string | null;
    overlayOpacity: number;
    focalPoint: "center" | "right" | "left" | "top";
  };
};

export type ResultTemplate = "financial_forecast" | "estimate_breakdown" | "curated_match" | "diagnostic_audit";
export type ValueFormat = "currency" | "percent" | "number" | "text";
export type CompareOp = "lt" | "lte" | "gt" | "gte" | "eq";

export type ResultRule = {
  id: string;
  variable: string;
  operator: CompareOp;
  value: number;
  headline: string;
  description: string;
  eyebrow?: string;
  overrideVariables?: Record<string, number>;
};

export type ResultPreview = {
  enabled: boolean;
  template: ResultTemplate;
  loader: { enabled: boolean; durationMs: number; steps: string[] };
  currency: { symbol: string; position: "before" | "after"; decimals: number };
  eyebrow: string;
  defaultHeadline: string;
  defaultDescription: string;
  rules: ResultRule[];
  kpis: Array<{ id: string; valueExpr: string; label: string; format: ValueFormat; accent?: boolean }>;
  table: {
    columns: Array<{ key: string; label: string; format: ValueFormat; align?: "left" | "right" }>;
    rows: Array<{ id: string; cells: Record<string, string>; locked: boolean }>;
  } | null;
  matches: {
    badgeText: string;
    items: Array<{ id: string; title: string; subtitle: string; priceExpr: string; metricText: string; imageUrl?: string | null; locked: boolean }>;
  } | null;
  audit: {
    scoreExpr: string;
    scoreLabel: string;
    impactExpr: string;
    insights: Array<{ id: string; title: string; detail: string; locked: boolean }>;
  } | null;
  lockBadgeText: string;
  footnote: string;
  revealFullResultOnThankYou: boolean;
  sampleDefaults?: Record<string, number>;
};

export type QuizSchema = {
  startScreen: StartScreen;
  giftsConfig: GiftsConfig;
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
  resultPreview: ResultPreview;
  consultant: QuizConsultant;
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
      layout: "cinematic_hero",
      brand: { show: true, name: "", logoUrl: "" },
      eyebrow: { show: true, text: "2 минуты" },
      trustBadge: { show: true, primaryText: "Без обязательств", secondaryText: "" },
      headline: title,
      highlightStyle: "badge",
      subheadline: { show: true, text: "Ответьте на несколько вопросов. Мы посчитаем ориентир и свяжемся с вами." },
      bullets: {
        show: true,
        iconStyle: "check",
        layout: "auto",
        items: [
          bullet("b1", "Ориентир **за 2 минуты**"),
          bullet("b2", "Без созвона, пока сами не попросите"),
          bullet("b3", "Цифра в ответе, не презентация"),
          bullet("b4", "Дальше пишет живой менеджер"),
        ],
      },
      ctaText: "Начать",
      ctaMicroText: { show: true, text: "3 вопроса · займёт 45 сек" },
      media: { type: "none", url: null, overlayOpacity: 60, focalPoint: "center" },
    },
    giftsConfig: {
      showOnStart: true,
      showInProgress: true,
      showOnThankYou: true,
      sectionLabel: "Бонус после прохождения",
      deliveryChannel: "page",
      messengerUrl: null,
      emailNote: null,
      items: [gift("gift-1", "file", "Чек-лист перед решением", "PDF · короткий разбор", "Скачать PDF")],
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
    resultPreview: disabledResult(),
    consultant: defaultConsultant(false),
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
    helper: emptyHelper(),
  };
}

function option(id: string, label: string): QuizOption {
  return { id, label, description: "", imageUrl: "", nextStepId: null, priceImpact: 0 };
}

function bullet(id: string, textValue: string): StartBullet {
  return { id, text: textValue, icon: "check" };
}

function gift(id: string, type: GiftType, title: string, subtitle: string, actionLabel: string): QuizGift {
  return { id, type, title, subtitle, coverUrl: null, fileUrl: null, fileName: null, actionUrl: null, actionLabel };
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
  const startScreen = readStart(record.startScreen, fallback.startScreen);
  return {
    startScreen,
    giftsConfig: readGifts(record.giftsConfig, legacyBonus(record.startScreen)),
    steps: (steps.length > 0 ? steps : fallback.steps).slice(0, 12).map((item, index) => ({ ...item, order: index })),
    calculator: readCalculator(record.calculator),
    leadScreen: readLead(record.leadScreen, fallback.leadScreen),
    thankYouScreen: readThanks(record.thankYouScreen, fallback.thankYouScreen),
    resultPreview: readResult(record.resultPreview),
    consultant: readConsultant(record.consultant),
    hideBranding: record.hideBranding === true,
  };
}

function legacyBonus(value: unknown) {
  return text(asRecord(value).bonusBadge, "");
}

function readStart(value: unknown, fallback: StartScreen): StartScreen {
  const record = asRecord(value);
  const legacyImage = text(record.imageUrl, "");
  return {
    enabled: record.enabled !== false,
    layout: readLayout(record.layout),
    brand: readBrand(record.brand),
    eyebrow: readToggleText(record.eyebrow, fallback.eyebrow.text),
    trustBadge: readTrust(record.trustBadge, text(record.trustLine, "")),
    headline: text(record.headline, fallback.headline).slice(0, 180),
    highlightStyle: readHighlight(record.highlightStyle),
    subheadline: readToggleText(record.subheadline, fallback.subheadline.text),
    bullets: readBullets(record.bullets),
    ctaText: text(record.ctaText, fallback.ctaText).slice(0, 40),
    ctaMicroText: readMicro(record.ctaMicroText),
    media: readMedia(record.media, legacyImage),
  };
}

function readLayout(value: unknown): StartLayout {
  if (value === "editorial_split" || value === "split_image") return "editorial_split";
  if (value === "spotlight_center") return "spotlight_center";
  if (value === "swiss_minimal") return "swiss_minimal";
  return "cinematic_hero";
}

function readHighlight(value: unknown): HighlightStyle {
  if (value === "accent_text" || value === "underline") return value;
  return "badge";
}

function readBrand(value: unknown): StartScreen["brand"] {
  const record = asRecord(value);
  const name = text(record.name, "");
  const logoUrl = text(record.logoUrl, "");
  return { show: record.show !== false, ...(name ? { name: name.slice(0, 60) } : {}), ...(logoUrl ? { logoUrl } : {}) };
}

function readToggleText(value: unknown, fallbackText: string): { show: boolean; text: string } {
  if (typeof value === "string") {
    const next = value.trim();
    return { show: next.length > 0, text: (next || fallbackText).slice(0, 220) };
  }
  const record = asRecord(value);
  const next = text(record.text, fallbackText).slice(0, 220);
  return { show: record.show !== false && next.length > 0, text: next };
}

function readTrust(value: unknown, trustLine: string): StartScreen["trustBadge"] {
  const record = asRecord(value);
  const primary = text(record.primaryText, trustLine).slice(0, 48);
  const secondary = text(record.secondaryText, "").slice(0, 48);
  const hasObject = Object.keys(record).length > 0;
  return {
    show: hasObject ? record.show !== false && primary.length > 0 : primary.length > 0,
    primaryText: primary,
    ...(secondary ? { secondaryText: secondary } : {}),
  };
}

function readMicro(value: unknown): StartScreen["ctaMicroText"] {
  if (typeof value === "string") {
    const next = value.trim().slice(0, 60);
    return { show: next.length > 0, text: next };
  }
  const record = asRecord(value);
  const next = text(record.text, "").slice(0, 60);
  return { show: record.show !== false && next.length > 0, text: next };
}

function readMedia(value: unknown, legacyImage: string): StartScreen["media"] {
  const record = asRecord(value);
  const url = text(record.url, legacyImage);
  const focal = record.focalPoint === "left" || record.focalPoint === "right" || record.focalPoint === "top" ? record.focalPoint : "center";
  const type = record.type === "video" || record.type === "image" || record.type === "none" ? record.type : url ? "image" : "none";
  return {
    type: url && type !== "none" ? type : "none",
    url: url || null,
    overlayOpacity: Math.min(85, Math.max(30, Math.round(number(record.overlayOpacity, 60)))),
    focalPoint: focal,
  };
}

function readBullets(value: unknown): StartScreen["bullets"] {
  const record = asRecord(value);
  const source = Array.isArray(value) ? value : Array.isArray(record.items) ? record.items : [];
  const items = source.map(readBullet).filter((item): item is StartBullet => item !== null).slice(0, 6);
  const iconStyle: BulletIconStyle = record.iconStyle === "icon" || record.iconStyle === "number" ? record.iconStyle : "check";
  const layout: BulletLayout = record.layout === "grid_2" || record.layout === "stack" ? record.layout : "auto";
  return { show: items.length > 0 && record.show !== false, iconStyle, layout, items };
}

function readBullet(value: unknown): StartBullet | null {
  if (typeof value === "string" && value.trim()) {
    return { id: `b-${Math.random().toString(36).slice(2, 7)}`, text: value.trim().slice(0, 120), icon: "check" };
  }
  const record = asRecord(value);
  const line = text(record.text, text(record.label, ""));
  if (!line) return null;
  const icon = text(record.icon, "");
  return { id: (text(record.id, "") || `b-${Math.random().toString(36).slice(2, 7)}`).slice(0, 40), text: line.slice(0, 120), ...(icon ? { icon: icon.slice(0, 20) } : {}) };
}

function readGifts(value: unknown, bonusBadge: string): GiftsConfig {
  const record = asRecord(value);
  const items = Array.isArray(record.items) ? record.items.map(readGift).filter((item): item is QuizGift => item !== null).slice(0, 3) : [];
  if (items.length === 0 && bonusBadge.trim()) {
    items.push(gift("legacy-bonus", "discount", bonusBadge.trim().slice(0, 120), "", "Открыть"));
  }
  const channel = record.deliveryChannel === "messenger" || record.deliveryChannel === "email" ? record.deliveryChannel : "page";
  return {
    showOnStart: record.showOnStart !== false,
    showInProgress: record.showInProgress !== false,
    showOnThankYou: record.showOnThankYou !== false,
    sectionLabel: text(record.sectionLabel, "Бонус после прохождения").slice(0, 60),
    deliveryChannel: channel,
    messengerUrl: text(record.messengerUrl, "").slice(0, 300) || null,
    emailNote: text(record.emailNote, "").slice(0, 180) || null,
    items,
  };
}

function readGift(value: unknown): QuizGift | null {
  const record = asRecord(value);
  const title = text(record.title, "");
  if (!title) return null;
  const type: GiftType = record.type === "link" || record.type === "discount" ? record.type : "file";
  return {
    id: (text(record.id, "") || `g-${Math.random().toString(36).slice(2, 7)}`).slice(0, 40),
    type,
    title: title.slice(0, 120),
    subtitle: text(record.subtitle, "").slice(0, 80),
    coverUrl: text(record.coverUrl, "") || null,
    fileUrl: text(record.fileUrl, "") || null,
    fileName: text(record.fileName, "") || null,
    actionUrl: text(record.actionUrl, "") || null,
    actionLabel: text(record.actionLabel, type === "link" ? "Открыть каталог" : type === "file" ? "Скачать PDF" : "Открыть").slice(0, 40),
  };
}

function readStep(value: unknown): QuizStep | null {
  const record = asRecord(value);
  const title = text(record.title, text(record.question, ""));
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
    helper: readHelper(record.helper, text(record.expertTip, "")),
    ...optionalKey(text(record.variableKey, "")),
    ...optionalDefault(record.defaultNumericValue),
  };
}

function optionalKey(value: string): { variableKey: string } | Record<string, never> {
  const key = value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32);
  return key ? { variableKey: key } : {};
}

function optionalDefault(value: unknown): { defaultNumericValue: number } | Record<string, never> {
  const parsed = optionalNumber(value);
  return parsed === undefined ? {} : { defaultNumericValue: parsed };
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readOption(value: unknown): QuizOption | null {
  if (typeof value === "string" && value.trim()) return option(`o-${Math.random().toString(36).slice(2, 7)}`, value.trim().slice(0, 80));
  const record = asRecord(value);
  const label = text(record.label, text(record.text, ""));
  if (!label) return null;
  const numeric = optionalNumber(record.numericValue);
  return {
    id: (text(record.id, "") || `o-${Math.random().toString(36).slice(2, 7)}`).slice(0, 40),
    label: label.slice(0, 80),
    description: text(record.description, "").slice(0, 140),
    imageUrl: text(record.imageUrl, ""),
    nextStepId: typeof record.nextStepId === "string" && record.nextStepId ? record.nextStepId.slice(0, 40) : null,
    priceImpact: number(record.priceImpact, 0),
    ...(numeric === undefined ? {} : { numericValue: numeric }),
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

export function defaultConsultant(enabled = false): QuizConsultant {
  return {
    enabled,
    defaultMode: "text",
    name: "Алексей Громов",
    role: "Эксперт",
    avatarUrl: null,
    aiAvatarId: "alexei",
    aiVoiceLocale: "ru",
    showOnLeadScreen: false,
  };
}

export function emptyHelper(): StepHelper {
  return {
    enabled: false,
    mode: "inherit",
    text: "",
    customVideoUrl: null,
    customVideoPosterUrl: null,
    aiAvatar: { avatarId: null, script: "", voiceStyle: "confident", status: "idle", videoUrl: null },
  };
}

function readConsultant(value: unknown): QuizConsultant {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return defaultConsultant(false);
  const base = defaultConsultant(false);
  const mode: ConsultantMode = record.defaultMode === "ai_avatar" || record.defaultMode === "custom_video" ? record.defaultMode : "text";
  const locale: VoiceLocale = record.aiVoiceLocale === "en" || record.aiVoiceLocale === "es" || record.aiVoiceLocale === "de" ? record.aiVoiceLocale : "ru";
  return {
    enabled: record.enabled === true,
    defaultMode: mode,
    name: text(record.name, base.name).slice(0, 60),
    role: text(record.role, base.role).slice(0, 80),
    avatarUrl: text(record.avatarUrl, "") || null,
    aiAvatarId: text(record.aiAvatarId, "") || null,
    aiVoiceLocale: locale,
    showOnLeadScreen: record.showOnLeadScreen === true,
  };
}

function readHelper(value: unknown, expertTip: string): StepHelper {
  const record = asRecord(value);
  const missing = Object.keys(record).length === 0;
  const tip = text(record.text, expertTip).slice(0, 220);
  const avatar = asRecord(record.aiAvatar);
  const style: VoiceStyle = avatar.voiceStyle === "calm" || avatar.voiceStyle === "friendly" ? avatar.voiceStyle : "confident";
  const status: AvatarJobStatus = avatar.status === "queued" || avatar.status === "ready" || avatar.status === "provider_pending" ? avatar.status : "idle";
  const mode: HelperMode = record.mode === "text" || record.mode === "ai_avatar" || record.mode === "custom_video" ? record.mode : "inherit";
  const video = text(record.customVideoUrl, "") || null;
  const generated = text(avatar.videoUrl, "") || null;
  return {
    enabled: missing ? Boolean(tip || video || generated) : record.enabled !== false,
    mode,
    text: tip,
    customVideoUrl: video,
    customVideoPosterUrl: text(record.customVideoPosterUrl, "") || null,
    aiAvatar: {
      avatarId: text(avatar.avatarId, "") || null,
      script: text(avatar.script, tip).slice(0, 500),
      voiceStyle: style,
      status,
      videoUrl: generated,
    },
  };
}

export function disabledResult(): ResultPreview {
  return {
    enabled: false,
    template: "financial_forecast",
    loader: { enabled: true, durationMs: 1300, steps: ["Анализируем ваши параметры…", "Рассчитываем сценарии…", "Расчёт готов"] },
    currency: { symbol: "$", position: "before", decimals: 0 },
    eyebrow: "Ваш результат",
    defaultHeadline: "",
    defaultDescription: "",
    rules: [],
    kpis: [],
    table: null,
    matches: null,
    audit: null,
    lockBadgeText: "Полный расчёт — в WhatsApp",
    footnote: "Предварительный расчёт. Точные условия зафиксируем в мессенджере.",
    revealFullResultOnThankYou: false,
  };
}

function readResult(value: unknown): ResultPreview {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) return disabledResult();
  const base = disabledResult();
  const template: ResultTemplate =
    record.template === "estimate_breakdown" || record.template === "curated_match" || record.template === "diagnostic_audit" || record.template === "financial_forecast"
      ? record.template
      : "financial_forecast";
  const loader = asRecord(record.loader);
  const currency = asRecord(record.currency);
  const steps = Array.isArray(loader.steps) ? loader.steps.map((item) => text(item, "")).filter(Boolean).slice(0, 3) : [];
  return {
    enabled: record.enabled === true,
    template,
    loader: {
      enabled: loader.enabled !== false,
      durationMs: Math.min(2500, Math.max(800, Math.round(number(loader.durationMs, 1300)))),
      steps: steps.length > 0 ? steps : base.loader.steps,
    },
    currency: {
      symbol: text(currency.symbol, "$").slice(0, 8),
      position: currency.position === "after" ? "after" : "before",
      decimals: Math.min(2, Math.max(0, Math.round(number(currency.decimals, 0)))),
    },
    eyebrow: text(record.eyebrow, base.eyebrow).slice(0, 40),
    defaultHeadline: text(record.defaultHeadline, "").slice(0, 180),
    defaultDescription: text(record.defaultDescription, "").slice(0, 280),
    rules: Array.isArray(record.rules) ? record.rules.map(readRule).filter((item): item is ResultRule => item !== null).slice(0, 8) : [],
    kpis: Array.isArray(record.kpis) ? record.kpis.map(readKpi).filter((item): item is ResultPreview["kpis"][number] => item !== null).slice(0, 3) : [],
    table: readTable(record.table),
    matches: readMatches(record.matches),
    audit: readAudit(record.audit),
    lockBadgeText: text(record.lockBadgeText, base.lockBadgeText).slice(0, 80),
    footnote: text(record.footnote, base.footnote).slice(0, 180),
    revealFullResultOnThankYou: record.revealFullResultOnThankYou === true,
    ...readSamples(record.sampleDefaults),
  };
}

function readSamples(value: unknown): { sampleDefaults: Record<string, number> } | Record<string, never> {
  const record = asRecord(value);
  const sampleDefaults: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) {
    const name = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const parsed = optionalNumber(raw);
    if (name && parsed !== undefined) sampleDefaults[name] = parsed;
  }
  return Object.keys(sampleDefaults).length > 0 ? { sampleDefaults } : {};
}

function readRule(value: unknown): ResultRule | null {
  const record = asRecord(value);
  const variable = text(record.variable, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (!variable) return null;
  const operator: CompareOp = record.operator === "lt" || record.operator === "lte" || record.operator === "gt" || record.operator === "gte" || record.operator === "eq" ? record.operator : "gte";
  const overrides = asRecord(record.overrideVariables);
  const overrideVariables: Record<string, number> = {};
  for (const [key, raw] of Object.entries(overrides)) {
    const name = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    const parsed = optionalNumber(raw);
    if (name && parsed !== undefined) overrideVariables[name] = parsed;
  }
  return {
    id: (text(record.id, "") || `r-${Math.random().toString(36).slice(2, 7)}`).slice(0, 40),
    variable,
    operator,
    value: number(record.value, 0),
    headline: text(record.headline, "").slice(0, 180),
    description: text(record.description, "").slice(0, 280),
    ...(text(record.eyebrow, "") ? { eyebrow: text(record.eyebrow, "").slice(0, 40) } : {}),
    ...(Object.keys(overrideVariables).length > 0 ? { overrideVariables } : {}),
  };
}

function readKpi(value: unknown): ResultPreview["kpis"][number] | null {
  const record = asRecord(value);
  const valueExpr = text(record.valueExpr, "");
  const label = text(record.label, "");
  if (!valueExpr || !label) return null;
  const format: ValueFormat = record.format === "percent" || record.format === "number" || record.format === "text" || record.format === "currency" ? record.format : "currency";
  return {
    id: (text(record.id, "") || `k-${Math.random().toString(36).slice(2, 7)}`).slice(0, 40),
    valueExpr: valueExpr.slice(0, 160),
    label: label.slice(0, 40),
    format,
    ...(record.accent === true ? { accent: true } : {}),
  };
}

function readTable(value: unknown): ResultPreview["table"] {
  const record = asRecord(value);
  const columns = Array.isArray(record.columns) ? record.columns.map(readColumn).filter((item): item is NonNullable<ReturnType<typeof readColumn>> => item !== null).slice(0, 4) : [];
  const rows = Array.isArray(record.rows) ? record.rows.map(readRow).filter((item): item is NonNullable<ReturnType<typeof readRow>> => item !== null).slice(0, 5) : [];
  if (columns.length < 2 || rows.length === 0) return null;
  return { columns, rows };
}

function readColumn(value: unknown) {
  const record = asRecord(value);
  const key = text(record.key, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  const label = text(record.label, "");
  if (!key || !label) return null;
  const format: ValueFormat = record.format === "percent" || record.format === "number" || record.format === "text" || record.format === "currency" ? record.format : "text";
  return { key, label: label.slice(0, 32), format, align: record.align === "right" ? "right" as const : "left" as const };
}

function readRow(value: unknown) {
  const record = asRecord(value);
  const cellsIn = asRecord(record.cells);
  const cells: Record<string, string> = {};
  for (const [key, raw] of Object.entries(cellsIn)) cells[key] = text(raw, "").slice(0, 160);
  if (Object.keys(cells).length === 0) return null;
  return { id: (text(record.id, "") || `row-${Math.random().toString(36).slice(2, 7)}`).slice(0, 40), cells, locked: record.locked === true };
}

function readMatches(value: unknown): ResultPreview["matches"] {
  const record = asRecord(value);
  const items = Array.isArray(record.items) ? record.items.map(readMatch).filter((item): item is NonNullable<ReturnType<typeof readMatch>> => item !== null).slice(0, 4) : [];
  if (items.length === 0) return null;
  return { badgeText: text(record.badgeText, "Подборка").slice(0, 80), items };
}

function readMatch(value: unknown) {
  const record = asRecord(value);
  const title = text(record.title, "");
  if (!title) return null;
  return {
    id: (text(record.id, "") || `m-${Math.random().toString(36).slice(2, 7)}`).slice(0, 40),
    title: title.slice(0, 80),
    subtitle: text(record.subtitle, "").slice(0, 80),
    priceExpr: text(record.priceExpr, "").slice(0, 160),
    metricText: text(record.metricText, "").slice(0, 80),
    imageUrl: text(record.imageUrl, "") || null,
    locked: record.locked === true,
  };
}

function readAudit(value: unknown): ResultPreview["audit"] {
  const record = asRecord(value);
  const insights = Array.isArray(record.insights) ? record.insights.map(readInsight).filter((item): item is NonNullable<ReturnType<typeof readInsight>> => item !== null).slice(0, 5) : [];
  if (!text(record.scoreExpr, "") && insights.length === 0) return null;
  return {
    scoreExpr: text(record.scoreExpr, "0").slice(0, 160),
    scoreLabel: text(record.scoreLabel, "Индекс").slice(0, 40),
    impactExpr: text(record.impactExpr, "").slice(0, 80),
    insights,
  };
}

function readInsight(value: unknown) {
  const record = asRecord(value);
  const title = text(record.title, "");
  if (!title) return null;
  return {
    id: (text(record.id, "") || `i-${Math.random().toString(36).slice(2, 7)}`).slice(0, 40),
    title: title.slice(0, 80),
    detail: text(record.detail, "").slice(0, 160),
    locked: record.locked === true,
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
