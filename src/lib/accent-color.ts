export const DEFAULT_ACCENT_COLOR = "#FFE600";

const NAMED_COLORS: Record<string, string> = {
  white: "#FFFFFF",
  black: "#000000",
  red: "#EF4444",
  blue: "#3B82F6",
  green: "#22C55E",
  yellow: "#FFE600",
  orange: "#F97316",
  gold: "#D4AF37",
  pink: "#EC4899",
  purple: "#A855F7",
  cyan: "#06B6D4",
  белый: "#FFFFFF",
  черный: "#000000",
  чёрный: "#000000",
  красный: "#EF4444",
  синий: "#3B82F6",
  зеленый: "#22C55E",
  зелёный: "#22C55E",
  желтый: "#FFE600",
  жёлтый: "#FFE600",
  оранжевый: "#F97316",
  золотой: "#D4AF37",
  "золотой премиум": "#D4AF37",
  розовый: "#EC4899",
  фиолетовый: "#A855F7",
};

/** Normalize `#RGB` / `#RRGGBB` / `RGB` into `#RRGGBB`, or null. */
export function normalizeAccentHex(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{3}$/.test(hex)) {
    return `#${hex
      .split("")
      .map((char) => char + char)
      .join("")
      .toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex.toUpperCase()}`;
  return null;
}

/** HEX for CSS (picker / style props). Named labels map when possible. */
export function resolveAccentHex(value: string | null | undefined, fallback = DEFAULT_ACCENT_COLOR): string {
  const asHex = normalizeAccentHex(value);
  if (asHex) return asHex;
  const key = (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (key && NAMED_COLORS[key]) return NAMED_COLORS[key];
  // Partial match: "ЗОЛОТОЙ ПРЕМИУМ" → gold
  for (const [name, hex] of Object.entries(NAMED_COLORS)) {
    if (key.includes(name)) return hex;
  }
  return normalizeAccentHex(fallback) ?? DEFAULT_ACCENT_COLOR;
}

/** Raw label for GPT prompts (HEX or free text). */
export function accentColorForPrompt(value: string | null | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return DEFAULT_ACCENT_COLOR;
  return trimmed;
}

export function withAccentAlpha(hex: string, alpha: number): string {
  const normalized = resolveAccentHex(hex);
  const raw = normalized.slice(1);
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
