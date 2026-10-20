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
  {
    key: "premium-dark",
    name: "Premium Dark",
    category: "Премиум",
    note: "Одно фото на весь экран, тёмный градиент и акцентная кнопка",
    masterPrompt: `Visual system: Premium Dark full-bleed ad. One cinematic photographic background for a vertical 4:5 Meta creative, darker and calmer toward the bottom so React typography stays readable. Single hero scene, premium mood, no typography, no signage, no logos with words.`,
  },
  {
    key: "side-fade",
    name: "Side Fade",
    category: "Премиум",
    note: "Одно фото, затемнение слева под текст и CTA",
    masterPrompt: `Visual system: Side Fade ad. One photographic background for a vertical 4:5 Meta creative with the visual subject weighted to the right side; the left side should stay comparatively dark and uncluttered for React typography. No typography, no signage, no logos with words.`,
  },
  {
    key: "editorial-block",
    name: "Editorial Block",
    category: "Минимализм",
    note: "Чёрный текстовый блок + фото, белая полоса выгод и акцентный подвал",
    masterPrompt: `Visual system: Editorial Block ad. One clean photographic image for a vertical 4:5 Meta creative, editorial composition with a clear single subject that also reads well cropped into a side panel. No typography, no signage, no logos with words.`,
  },
] as const;

export type StudioStyleKey = (typeof studioStyles)[number]["key"];

/** Style 1 — Before/After VS split (two Flux backgrounds per creative). */
export const SPLIT_VS_STYLE_KEY = "before-after-vs" as const;

/** Style 2 — Dual split with accent typography (two Flux backgrounds). */
export const SPLIT_ACTION_STYLE_KEY = "split-action" as const;

/** Style 3 — Premium Dark (one Flux background). */
export const PREMIUM_DARK_STYLE_KEY = "premium-dark" as const;

/** Style 4 — Side Fade (one Flux background). */
export const SIDE_FADE_STYLE_KEY = "side-fade" as const;

/** Style 5 — Editorial Block (one Flux background). */
export const EDITORIAL_BLOCK_STYLE_KEY = "editorial-block" as const;

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

export function isPremiumDarkStyle(styleId: string | null | undefined): boolean {
  if (!styleId) return false;
  const key = styleId.trim().toLowerCase();
  return key === PREMIUM_DARK_STYLE_KEY || key === "3" || key === "style-3" || key === "style3";
}

export function isSideFadeStyle(styleId: string | null | undefined): boolean {
  if (!styleId) return false;
  const key = styleId.trim().toLowerCase();
  return key === SIDE_FADE_STYLE_KEY || key === "4" || key === "style-4" || key === "style4";
}

export function isEditorialBlockStyle(styleId: string | null | undefined): boolean {
  if (!styleId) return false;
  const key = styleId.trim().toLowerCase();
  return key === EDITORIAL_BLOCK_STYLE_KEY || key === "5" || key === "style-5" || key === "style5";
}

/** Dual-photo styles that need prompt_before + prompt_after. */
export function isDualImageStyle(styleId: string | null | undefined): boolean {
  return isSplitVsStyle(styleId) || isSplitActionStyle(styleId);
}

/** Single-photo styles (3, 4, 5 and any future non-split style): one Flux call. */
export function isSingleImageStyle(styleId: string | null | undefined): boolean {
  return isPremiumDarkStyle(styleId) || isSideFadeStyle(styleId) || isEditorialBlockStyle(styleId);
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

/** Accepts studio keys and numeric aliases like `"1"` … `"5"`. */
export function resolveStudioStyleKey(value: string): StudioStyleKey | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (isSplitVsStyle(trimmed)) return SPLIT_VS_STYLE_KEY;
  if (isSplitActionStyle(trimmed)) return SPLIT_ACTION_STYLE_KEY;
  if (isPremiumDarkStyle(trimmed)) return PREMIUM_DARK_STYLE_KEY;
  if (isSideFadeStyle(trimmed)) return SIDE_FADE_STYLE_KEY;
  if (isEditorialBlockStyle(trimmed)) return EDITORIAL_BLOCK_STYLE_KEY;
  return isStudioStyleKey(trimmed) ? trimmed : null;
}

/** Numeric id used in prompts / payloads: "1" … "5" (or the raw key). */
export function studioStyleNumericId(styleId: string | null | undefined): string {
  if (isSplitVsStyle(styleId)) return "1";
  if (isSplitActionStyle(styleId)) return "2";
  if (isPremiumDarkStyle(styleId)) return "3";
  if (isSideFadeStyle(styleId)) return "4";
  if (isEditorialBlockStyle(styleId)) return "5";
  return styleId ?? "";
}

export function isCreativeLanguage(value: string): value is CreativeLanguage {
  return creativeLanguages.some((language) => language.value === value);
}

export function isFontStyle(value: string): value is FontStyle {
  return fontStyles.some((style) => style.value === value);
}
