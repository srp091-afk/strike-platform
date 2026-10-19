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

export type AdGenerationStatus = "processing" | "ready" | "error";

export interface AdGeneration {
  id: string;
  project_id: string;
  title: string;
  style_name: string;
  status: AdGenerationStatus;
  is_active: boolean;
  /**
   * Flat legacy list OR nested pairs.
   * Prefer `imageSets` — one entry per creative card: `[url]` or `[before, after]`.
   */
  images: string[];
  imageSets: string[][];
  created_at: string;
}
