export const studioStyles = [
  {
    key: "before-after-vs",
    name: "До / После (VS)",
    category: "Сплит",
    note: "Два фона: проблема слева, результат справа",
    masterPrompt: `Visual system: Before/After split ad. Two contrasting photographic backgrounds for a vertical 4:5 Meta creative. Left ("before") is bleak, problem-state, colder and darker. Right ("after") is bright, resolved, aspirational success with the product benefit implied visually — never with text. No typography, no signage, no logos with words.`,
  },
  {
    key: "dark-editorial-grid",
    name: "Dark Editorial Grid",
    category: "Минимализм",
    note: "Швейцарская сетка, акцентный бейдж, холст #0A0A0A",
    masterPrompt: `Visual system: Dark Editorial Grid. Canvas #0A0A0A, Swiss grid, thin white rules, numbered badge, high-contrast typography, asymmetric columns, editorial magazine energy. No clutter, no stock-photo clichés. Vertical 4:5 ad format.`,
  },
  {
    key: "dark-luxury-minimal",
    name: "Dark Luxury Minimal",
    category: "Премиум",
    note: "Монохромная глубина и ультратонкие разделители",
    masterPrompt: `Visual system: Dark Luxury Minimal. Deep monochrome gradients, soft spotlight, ultra-thin hairline dividers, generous negative space, atelier/premium quiet luxury mood. Vertical 4:5 ad format. No busy patterns.`,
  },
] as const;

export type StudioStyleKey = (typeof studioStyles)[number]["key"];

/** Style 1 — Before/After VS split (two Flux backgrounds per creative). */
export const SPLIT_VS_STYLE_KEY = "before-after-vs" as const;

export function isSplitVsStyle(styleId: string | null | undefined): boolean {
  if (!styleId) return false;
  const key = styleId.trim().toLowerCase();
  return key === SPLIT_VS_STYLE_KEY || key === "1" || key === "style-1" || key === "style1";
}

export const styleFilters = ["Все", "Сплит", "Премиум", "Минимализм"] as const;

export const creativeLanguages = [
  { value: "ru", label: "Русский (RU)" },
  { value: "en", label: "English (EN)" },
  { value: "de", label: "Deutsch (DE)" },
  { value: "sk", label: "Slovak (SK)" },
  { value: "es", label: "Español (ES)" },
] as const;

export type CreativeLanguage = (typeof creativeLanguages)[number]["value"];

export const fontStyles = [
  {
    value: "premium",
    label: "Премиум (Modern Swiss)",
    pair: "Montserrat & Inter",
  },
  {
    value: "impact",
    label: "Агрессивный маркетинг (Bold Impact)",
    pair: "Bebas Neue & Oswald",
  },
  {
    value: "minimal",
    label: "Чистый минимализм (Neo-Grotesque)",
    pair: "Plus Jakarta Sans & Inter",
  },
] as const;

export type FontStyle = (typeof fontStyles)[number]["value"];

export function isStudioStyleKey(value: string): value is StudioStyleKey {
  return studioStyles.some((style) => style.key === value);
}

/** Accepts studio keys and numeric aliases like `"1"` for Style1 VS. */
export function resolveStudioStyleKey(value: string): StudioStyleKey | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isSplitVsStyle(trimmed)) return SPLIT_VS_STYLE_KEY;
  return isStudioStyleKey(trimmed) ? trimmed : null;
}

export function isCreativeLanguage(value: string): value is CreativeLanguage {
  return creativeLanguages.some((language) => language.value === value);
}

export function isFontStyle(value: string): value is FontStyle {
  return fontStyles.some((style) => style.value === value);
}
