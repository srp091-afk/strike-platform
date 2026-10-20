/** Creative orientation: feed 4:5 or stories 9:16. */
export type CreativeFormat = "4:5" | "9:16";

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
  /** Layout format; templates adapt canvas + safe zones. Defaults to 4:5. */
  format?: CreativeFormat;
}
