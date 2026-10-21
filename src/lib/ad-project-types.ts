import type { CreativeFormat } from "@/types/creatives";

export type AdsPreviewCreative = {
  images: string[];
  headline: string;
  subheadline?: string;
  bullets: string[];
  /** Strategy anti-benefits for the "before" list in split templates. */
  antiBullets?: string[];
  badge?: string;
  buttonText: string;
  styleKey: string;
  accentColor: string;
  /** Generation format of this creative (feed 4:5 / stories 9:16). */
  format?: CreativeFormat;
};

export type AdsProjectCard = {
  id: string;
  name: string;
  updatedAt: string | null;
  creativesReplaceAt: string | null;
  /** Flat URLs kept for overflow count / legacy callers. */
  previewImages: string[];
  /** Structured thumbs for React template previews. */
  previewCreatives: AdsPreviewCreative[];
};
