import type { CreativeFormat } from "@/types/creatives";

export interface AdFormattedBrief {
  product: string;
  audience: string;
  key_advantages: string;
  offer: string;
}

export interface AdCreativeTexts {
  headline: string;
  subheadline: string;
  benefit: string;
  cta: string;
  /** Short marketing trigger badge (complete phrase, up to 8 words), derived from hook. */
  badge?: string;
}

export interface AdCreative {
  id: string;
  /** Primary / "before" URL (always set). */
  image_url: string;
  /** `[url]` for single styles, `[before, after]` for Style1 VS split. */
  image_urls: string[];
  prompt: string;
  prompts?: {
    before?: string;
    after?: string;
  };
  texts: AdCreativeTexts;
  style_id: string;
  /** User accent (HEX or label) for React templates. */
  accent_color: string;
  /** Generation format: feed 4:5 or stories 9:16. */
  aspect_ratio?: CreativeFormat;
}

export interface AdLeadQuestion {
  question: string;
  options: string[];
}

export interface AdStrategy {
  strategy: {
    target_audience_insight: string;
    core_offer_angle: string;
    hook_concept: string;
  };
  creatives: {
    headlines: string[];
    subheadlines: string[];
    benefits: string[];
    buttons: string[];
    /** Editable badge (УТП/триггер) variants; applied at generation time. */
    badges: string[];
  };
  facebook_setup: {
    primary_texts: string[];
    headlines: string[];
    descriptions: string[];
  };
  lead_form: {
    headline: string;
    welcome_screen_bullets: string[];
    questions: AdLeadQuestion[];
    thank_you_screen: {
      headline: string;
      description: string;
    };
    call_to_action: string;
  };
}

/** One creative card backed by an `ad_creatives` row (soft-deletable by `id`). */
export interface AdGenerationCreative {
  /** `ad_creatives.id`; null for legacy generations without rows yet. */
  id: string | null;
  /** `[url]` or `[before, after]`. */
  images: string[];
  headline: string;
  subheadline?: string;
  bullets: string[];
  badge?: string;
  buttonText: string;
  /** `creative_templates` UUID (or legacy key, normalized at render). */
  styleId: string | null;
  accentColor?: string;
  /** Per-creative format from `ad_creatives.aspect_ratio`. */
  format?: CreativeFormat;
}

export type AdGenerationStatus = "processing" | "ready" | "error";

export interface AdGeneration {
  id: string;
  project_id: string;
  title: string;
  style_name: string;
  status: AdGenerationStatus;
  is_active: boolean;
  /** Generation format (feed 4:5 / stories 9:16); legacy rows default to 4:5. */
  aspect_ratio?: CreativeFormat;
  /**
   * Flat legacy list OR nested pairs.
   * Prefer `imageSets` — one entry per creative card: `[url]` or `[before, after]`.
   */
  images: string[];
  imageSets: string[][];
  /** Visible `ad_creatives` rows of this generation, when available. */
  creatives?: AdGenerationCreative[];
  created_at: string;
}
