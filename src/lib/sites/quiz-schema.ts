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

export type StartLayout = "cinematic_hero" | "editorial_split" | "spotlight_center" | "swiss_minimal";
export type HighlightStyle = "badge" | "accent_text" | "underline";
export type BulletIconStyle = "check" | "icon" | "number";
export type BulletLayout = "auto" | "grid_2" | "stack";
export type GiftType = "file" | "link" | "discount";

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
  return { show: record.show === true && next.length > 0, text: next };
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
  const items = Array.isArray(record.items) ? record.items.map(readBullet).filter((item): item is StartBullet => item !== null).slice(0, 6) : [];
  const iconStyle: BulletIconStyle = record.iconStyle === "icon" || record.iconStyle === "number" ? record.iconStyle : "check";
  const layout: BulletLayout = record.layout === "grid_2" || record.layout === "stack" ? record.layout : "auto";
  return { show: items.length > 0 && record.show !== false, iconStyle, layout, items };
}

function readBullet(value: unknown): StartBullet | null {
  const record = asRecord(value);
  const line = text(record.text, "");
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
  return {
    showOnStart: record.showOnStart !== false,
    showInProgress: record.showInProgress !== false,
    showOnThankYou: record.showOnThankYou !== false,
    sectionLabel: text(record.sectionLabel, "Бонус после прохождения").slice(0, 60),
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
