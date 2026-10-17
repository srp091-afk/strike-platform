import type { AdCreative } from "@/lib/ad-types";

export function plusDaysIso(from: Date, days: number) {
  const date = new Date(from.getTime());
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export function toDateInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function fromDateInputValue(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return new Date(`${trimmed}T12:00:00.000Z`).toISOString();
}

export function formatRuDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function isRealCreativeImageUrl(url: string) {
  const value = url.trim();
  if (!/^https?:\/\//i.test(value)) return false;
  // Exclude generation-failure placeholders used only as backend fallbacks.
  if (/placehold\.co/i.test(value)) return false;
  if (/Image\+Generation\+Failed|Creative\+Ready/i.test(value)) return false;
  return true;
}

export function imageUrlsFromCreativesData(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const url = (item as AdCreative).image_url;
    return typeof url === "string" && isRealCreativeImageUrl(url) ? [url.trim()] : [];
  });
}

export function imageUrlsFromGenerationImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const url = typeof item === "string" ? item.trim() : "";
    return isRealCreativeImageUrl(url) ? [url] : [];
  });
}
