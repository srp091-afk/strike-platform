import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isRealCreativeImageUrl } from "@/lib/ad-project-media";
import type { AdCreativeTexts } from "@/lib/ad-types";

/**
 * Rows of `public.ad_creatives` — the source of truth for creative cards.
 * Soft delete only: a creative is hidden when `deleted_at` is set; reads
 * always filter `.is("deleted_at", null)`. Nothing is physically deleted
 * and Storage files are never removed.
 *
 * Extended columns (generation_id, style_id, image_urls, texts,
 * accent_color, sort_index) come from
 * `supabase/migrations/20261020_ad_creatives_soft_delete.sql`. Until that
 * migration runs, reads/writes transparently fall back to the base
 * columns and callers keep using the legacy ad_generations payload.
 */
export interface AdCreativeRow {
  id: string;
  project_id: string;
  generation_id: string | null;
  image_url: string;
  image_urls: string[];
  headline: string | null;
  body_text: string | null;
  style_id: string | null;
  texts: AdCreativeTexts | null;
  accent_color: string | null;
  sort_index: number;
  created_at: string | null;
  deleted_at: string | null;
}

export interface NewAdCreative {
  project_id: string;
  generation_id: string | null;
  image_url: string;
  image_urls: string[];
  headline: string | null;
  body_text: string | null;
  style_id: string | null;
  texts: AdCreativeTexts | null;
  accent_color: string | null;
  sort_index: number;
  /** Set only for legacy tombstone/backfill inserts. */
  deleted_at?: string | null;
}

const EXTENDED_SELECT =
  "id, project_id, generation_id, image_url, image_urls, headline, body_text, style_id, texts, accent_color, sort_index, created_at, deleted_at";
const BASE_SELECT = "id, project_id, image_url, headline, body_text, created_at, deleted_at";

export interface VisibleCreatives {
  rows: AdCreativeRow[];
  /** False when extended columns are missing (migration not applied yet). */
  extended: boolean;
}

/** Visible (not soft-deleted) creatives for the given projects, newest first. */
export async function listVisibleAdCreatives(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<VisibleCreatives> {
  if (projectIds.length === 0) return { rows: [], extended: true };

  const extended = await supabase
    .from("ad_creatives")
    .select(EXTENDED_SELECT)
    .in("project_id", projectIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("sort_index", { ascending: true });

  if (!extended.error) {
    return { rows: (extended.data ?? []).map((row) => parseRow(row, true)), extended: true };
  }

  const base = await supabase
    .from("ad_creatives")
    .select(BASE_SELECT)
    .in("project_id", projectIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (base.error) {
    console.error("[ad-creatives] list", base.error.message);
    return { rows: [], extended: false };
  }
  return { rows: (base.data ?? []).map((row) => parseRow(row, false)), extended: false };
}

/** Insert creative rows (extended columns when available, base otherwise). */
export async function insertAdCreatives(
  supabase: SupabaseClient,
  creatives: NewAdCreative[],
): Promise<{ error: string | null; extended: boolean }> {
  if (creatives.length === 0) return { error: null, extended: true };

  const extended = await supabase.from("ad_creatives").insert(
    creatives.map((creative) => ({
      project_id: creative.project_id,
      generation_id: creative.generation_id,
      image_url: creative.image_url,
      image_urls: creative.image_urls,
      headline: creative.headline,
      body_text: creative.body_text,
      style_id: creative.style_id,
      texts: creative.texts,
      accent_color: creative.accent_color,
      sort_index: creative.sort_index,
      ...(creative.deleted_at ? { deleted_at: creative.deleted_at } : {}),
    })),
  );
  if (!extended.error) return { error: null, extended: true };

  const base = await supabase.from("ad_creatives").insert(
    creatives.map((creative) => ({
      project_id: creative.project_id,
      image_url: creative.image_url,
      headline: creative.headline,
      body_text: creative.body_text,
      ...(creative.deleted_at ? { deleted_at: creative.deleted_at } : {}),
    })),
  );
  if (base.error) return { error: base.error.message, extended: false };
  return { error: null, extended: false };
}

/** Image set of a creative row: `[before, after]` or `[url]`, real URLs only. */
export function creativeRowImages(row: AdCreativeRow): string[] {
  const fromSet = row.image_urls.filter((url) => isRealCreativeImageUrl(url));
  if (fromSet.length > 0) return fromSet;
  return isRealCreativeImageUrl(row.image_url) ? [row.image_url.trim()] : [];
}

function parseRow(raw: Record<string, unknown>, extended: boolean): AdCreativeRow {
  return {
    id: String(raw.id ?? ""),
    project_id: String(raw.project_id ?? ""),
    generation_id: extended && typeof raw.generation_id === "string" ? raw.generation_id : null,
    image_url: typeof raw.image_url === "string" ? raw.image_url : "",
    image_urls:
      extended && Array.isArray(raw.image_urls)
        ? raw.image_urls.flatMap((url) => (typeof url === "string" && url.trim() ? [url.trim()] : []))
        : [],
    headline: typeof raw.headline === "string" ? raw.headline : null,
    body_text: typeof raw.body_text === "string" ? raw.body_text : null,
    style_id: extended && typeof raw.style_id === "string" ? raw.style_id : null,
    texts: extended ? parseTexts(raw.texts) : null,
    accent_color: extended && typeof raw.accent_color === "string" ? raw.accent_color : null,
    sort_index: extended && typeof raw.sort_index === "number" ? raw.sort_index : 0,
    created_at: typeof raw.created_at === "string" ? raw.created_at : null,
    deleted_at: typeof raw.deleted_at === "string" ? raw.deleted_at : null,
  };
}

function parseTexts(value: unknown): AdCreativeTexts | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const text = (key: string) => (typeof row[key] === "string" ? (row[key] as string) : "");
  return {
    headline: text("headline"),
    subheadline: text("subheadline"),
    benefit: text("benefit"),
    cta: text("cta"),
    ...(typeof row.badge === "string" && row.badge.trim() ? { badge: row.badge } : {}),
  };
}
