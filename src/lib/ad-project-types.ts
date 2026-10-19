export type AdsPreviewCreative = {
  images: string[];
  headline: string;
  subheadline?: string;
  bullets: string[];
  badge?: string;
  buttonText: string;
  styleKey: string;
  accentColor: string;
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
