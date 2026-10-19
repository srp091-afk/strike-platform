export interface CreativeTemplateProps {
  headline: string;
  subheadline?: string;
  bullets: string[];
  badge?: string;
  buttonText: string;
  /** Image URLs — splits need 2–3, single-panel layouts need 1. */
  images: string[];
  /** HEX (or resolved) accent for buttons, checks, borders — applied via inline styles. */
  accentColor: string;
}
