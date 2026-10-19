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
    const row = item as AdCreative;
    if (Array.isArray(row.image_urls) && row.image_urls.length > 0) {
      return row.image_urls.flatMap((url) =>
        typeof url === "string" && isRealCreativeImageUrl(url) ? [url.trim()] : [],
      );
    }
    const url = row.image_url;
    return typeof url === "string" && isRealCreativeImageUrl(url) ? [url.trim()] : [];
  });
}

/** Normalize generation `images` jsonb: flat strings or nested `[before, after]` sets. */
export function imageSetsFromGenerationImages(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  const sets: string[][] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const url = item.trim();
      if (isRealCreativeImageUrl(url)) sets.push([url]);
      continue;
    }
    if (Array.isArray(item)) {
      const urls = item.flatMap((entry) => {
        const url = typeof entry === "string" ? entry.trim() : "";
        return isRealCreativeImageUrl(url) ? [url] : [];
      });
      if (urls.length > 0) sets.push(urls);
    }
  }
  return sets;
}

export function imageUrlsFromGenerationImages(value: unknown): string[] {
  return imageSetsFromGenerationImages(value).flat();
}

/** One card per creative: prefer nested pairs from creatives_data.image_urls. */
export function imageSetsFromCreativesData(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as AdCreative;
    if (Array.isArray(row.image_urls) && row.image_urls.length > 0) {
      const urls = row.image_urls.flatMap((url) =>
        typeof url === "string" && isRealCreativeImageUrl(url) ? [url.trim()] : [],
      );
      return urls.length > 0 ? [urls] : [];
    }
    const url = typeof row.image_url === "string" ? row.image_url.trim() : "";
    return isRealCreativeImageUrl(url) ? [[url]] : [];
  });
}
