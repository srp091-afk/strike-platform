import type { ThemeConfig, ThemePreset } from "@/lib/sites/quiz-schema";

export type QuizPalette = {
  bg: string;
  fg: string;
  muted: string;
  line: string;
  card: string;
  accent: string;
  radius: number;
  font: string;
};

const PRESETS: Record<ThemePreset, Omit<QuizPalette, "accent" | "radius" | "font">> = {
  dark_premium: { bg: "#0A0A0C", fg: "#F4F4F5", muted: "#A1A1AA", line: "rgba(255,255,255,0.10)", card: "#141417" },
  light_minimal: { bg: "#FFFFFF", fg: "#09090B", muted: "#52525B", line: "rgba(9,9,11,0.08)", card: "#F8F8F9" },
  editorial_warm: { bg: "#F6F4F0", fg: "#1C1917", muted: "#57534E", line: "rgba(28,25,23,0.12)", card: "#FFFDF8" },
};

export const THEME_LABEL: Record<ThemePreset, string> = {
  dark_premium: "Dark Premium",
  light_minimal: "Light Minimal",
  editorial_warm: "Editorial Warm",
};

export function quizPalette(theme: ThemeConfig): QuizPalette {
  return {
    ...PRESETS[theme.preset],
    accent: theme.accentColor,
    radius: theme.borderRadius,
    font: theme.fontFamily || "Inter",
  };
}

/** Тёмный текст на светлом акценте, белый — на тёмном. */
export function contrastInk(hex: string) {
  const raw = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return "#FFFFFF";
  const channel = (offset: number) => parseInt(raw.slice(offset, offset + 2), 16) / 255;
  const [r, g, b] = [channel(0), channel(2), channel(4)].map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.62 ? "#09090B" : "#FFFFFF";
}
