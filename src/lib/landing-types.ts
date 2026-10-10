export const LANDING_SECTION_TYPES = [
  "hero",
  "benefits",
  "services",
  "portfolio",
  "catalog",
  "reviews",
  "faq",
  "steps",
  "stats",
  "cta",
] as const;

export type LandingSectionType = (typeof LANDING_SECTION_TYPES)[number];

export type LandingItem = {
  title: string;
  text: string;
  meta: string;
};

export type LandingSectionContent = {
  eyebrow: string;
  headline: string;
  text: string;
  primaryCta: string;
  secondaryCta: string;
  items: LandingItem[];
};

export type LandingSection = {
  type: LandingSectionType;
  content: LandingSectionContent;
};

export type LandingTheme = {
  accent: string;
  background: string;
  foreground: string;
};

export type LandingDocument = {
  prompt: string;
  status: "draft" | "published";
  theme: LandingTheme;
  sections: LandingSection[];
};

export type LandingRecord = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
  agentId: string | null;
  agentName: string | null;
  captureMode: "chat" | "quiz";
  welcomeMessage: string;
  successMessage: string;
  document: LandingDocument;
  createdAt: string;
};

export const EMPTY_CONTENT: LandingSectionContent = {
  eyebrow: "",
  headline: "",
  text: "",
  primaryCta: "",
  secondaryCta: "",
  items: [],
};

export function emptyDocument(prompt = ""): LandingDocument {
  return {
    prompt,
    status: "draft",
    theme: { accent: "#E11D48", background: "#F8FAFC", foreground: "#09090B" },
    sections: [],
  };
}
