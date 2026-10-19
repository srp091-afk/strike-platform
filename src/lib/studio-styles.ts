export const studioStyles = [
  {
    key: "before-after-vs",
    name: "Сплит (До / После)",
    category: "Сплит",
    note: "Два фона: проблема слева, результат справа",
    masterPrompt: `Visual system: Before/After split ad. Two contrasting photographic backgrounds for a vertical 4:5 Meta creative. Left ("before") is bleak, problem-state, colder and darker. Right ("after") is bright, resolved, aspirational success with the product benefit implied visually — never with text. No typography, no signage, no logos with words.`,
  },
  {
    key: "split-action",
    name: "Split Action",
    category: "Сплит",
    note: "Два вертикальных кадра + акцентная типографика и CTA",
    masterPrompt: `Visual system: Dual vertical split-action ad. Two side-by-side photographic panels for a 4:5 Meta creative. Left and right scenes should feel like a before/after or contrast pair without any on-image text. Strong subject clarity, bold lighting contrast, no typography, no signage.`,
  },
] as const;

export type StudioStyleKey = (typeof studioStyles)[number]["key"];

/** Style 1 — Before/After VS split (two Flux backgrounds per creative). */
export const SPLIT_VS_STYLE_KEY = "before-after-vs" as const;

/** Style 2 — Dual split with accent typography (two Flux backgrounds). */
export const SPLIT_ACTION_STYLE_KEY = "split-action" as const;

export function isSplitVsStyle(styleId: string | null | undefined): boolean {
  if (!styleId) return false;
  const key = styleId.trim().toLowerCase();
  return key === SPLIT_VS_STYLE_KEY || key === "1" || key === "style-1" || key === "style1";
}

export function isSplitActionStyle(styleId: string | null | undefined): boolean {
  if (!styleId) return false;
  const key = styleId.trim().toLowerCase();
  return key === SPLIT_ACTION_STYLE_KEY || key === "2" || key === "style-2" || key === "style2";
}

/** Dual-photo styles that need prompt_before + prompt_after. */
export function isDualImageStyle(styleId: string | null | undefined): boolean {
  return isSplitVsStyle(styleId) || isSplitActionStyle(styleId);
}

export const styleFilters = ["Все", "Сплит"] as const;

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

/** Accepts studio keys and numeric aliases like `"1"` / `"2"`. */
export function resolveStudioStyleKey(value: string): StudioStyleKey | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isSplitVsStyle(trimmed)) return SPLIT_VS_STYLE_KEY;
  if (isSplitActionStyle(trimmed)) return SPLIT_ACTION_STYLE_KEY;
  return isStudioStyleKey(trimmed) ? trimmed : null;
}

export function isCreativeLanguage(value: string): value is CreativeLanguage {
  return creativeLanguages.some((language) => language.value === value);
}

export function isFontStyle(value: string): value is FontStyle {
  return fontStyles.some((style) => style.value === value);
}
