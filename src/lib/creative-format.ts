import type { CreativeFormat } from "@/types/creatives";

export const DEFAULT_CREATIVE_FORMAT: CreativeFormat = "4:5";

export const CREATIVE_FORMAT_OPTIONS: {
  value: CreativeFormat;
  label: string;
  /** Base generation resolution for the format. */
  resolution: string;
  /** Design canvas the React templates are laid out on. */
  canvas: { width: number; height: number };
}[] = [
  {
    value: "4:5",
    label: "Лента (4:5)",
    resolution: "1856×2304",
    canvas: { width: 1080, height: 1350 },
  },
  {
    value: "9:16",
    label: "Сторис (9:16)",
    resolution: "1080×1920",
    canvas: { width: 1080, height: 1920 },
  },
];

export function isCreativeFormat(value: unknown): value is CreativeFormat {
  return value === "4:5" || value === "9:16";
}

/** Normalize any stored/incoming value (`4:5`, `9:16`, `aspect_ratio`, …). */
export function resolveCreativeFormat(
  value: unknown,
  fallback: CreativeFormat = DEFAULT_CREATIVE_FORMAT,
): CreativeFormat {
  if (isCreativeFormat(value)) return value;
  if (typeof value === "string") {
    const normalized = value.trim().replace(/\s/g, "");
    if (normalized === "9:16" || /stor/i.test(normalized)) return "9:16";
    if (normalized === "4:5" || /feed|лент/i.test(normalized)) return "4:5";
  }
  return fallback;
}

export function creativeCanvasSize(format: CreativeFormat): { width: number; height: number } {
  return format === "9:16" ? { width: 1080, height: 1920 } : { width: 1080, height: 1350 };
}

/** Placeholder dims used when image generation fails, per format. */
export function creativePlaceholderSize(format: CreativeFormat): string {
  return format === "9:16" ? "1080x1920" : "1080x1350";
}
