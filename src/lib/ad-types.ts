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
  image_url: string;
  prompt: string;
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
  images: string[];
  created_at: string;
}
