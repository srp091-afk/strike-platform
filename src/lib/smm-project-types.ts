/** Типы SMM-проектов (без server-only: используются и на клиенте). */

export type SmmProject = {
  id: string;
  name: string;
  avatar_url: string | null;
  created_at: string;
};

export const SMM_PROJECT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SMM_PROJECT_NAME_MAX = 80;
export const SMM_PROJECTS_LIMIT = 50;

export const SMM_BRAND_FONTS = ["Inter", "Montserrat", "Roboto", "Playfair Display"] as const;
export const SMM_BRAND_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
export const SMM_BRAND_TEXT_MAX = 2000;

export type SmmProjectSettings = {
  toneOfVoice: string;
  targetAudience: string;
  brandColor: string;
  brandFont: string;
};

export const DEFAULT_SMM_PROJECT_SETTINGS: SmmProjectSettings = {
  toneOfVoice: "",
  targetAudience: "",
  brandColor: "#000000",
  brandFont: "Inter",
};
