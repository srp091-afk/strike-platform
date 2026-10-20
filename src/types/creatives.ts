/** Creative orientation: feed 4:5 or stories 9:16. */
export type CreativeFormat = "4:5" | "9:16";

/**
 * One pack slot. `format` is stamped at ADD time from the currently active
 * "ФОРМАТ" toggle — mixed packs (e.g. 2× 4:5 + 1× 9:16) are supported and
 * each creative is generated/rendered/exported in its own format.
 */
export interface StylePackItem {
  styleId: string;
  format: CreativeFormat;
}

export interface CreativeTemplateProps {
  headline: string;
  subheadline?: string;
  bullets: string[];
  /** Opposites of `bullets` for the "before" list in split templates. */
  antiBullets?: string[];
  badge?: string;
  buttonText: string;
  /** Typography preset value (studio-styles FontStyle); "ultra" = Bebas. */
  fontStyle?: string;
  /** Extra claim line rendered inside the image overlay (Split Action). */
  overlayText?: string;
  /** City/region from the brief (Side Fade footer); empty hides the line. */
  region?: string;
  /** Image URLs — splits need 2–3, single-panel layouts need 1. */
  images: string[];
  /** HEX (or resolved) accent for buttons, checks, borders — applied via inline styles. */
  accentColor: string;
  /** Layout format; templates adapt canvas + safe zones. Defaults to 4:5. */
  format?: CreativeFormat;
}
