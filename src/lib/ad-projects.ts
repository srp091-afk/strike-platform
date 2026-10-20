import "server-only";

import { DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import { parseAdStrategy } from "@/lib/ad-strategy";
import {
  imageSetsFromGenerationImages,
  imageUrlsFromCreativesData,
  isRealCreativeImageUrl,
} from "@/lib/ad-project-media";
import { creativeRowImages, listVisibleAdCreatives, type AdCreativeRow } from "@/lib/ad-creatives";
import type { AdsPreviewCreative, AdsProjectCard } from "@/lib/ad-project-types";
import type { AdCreative, AdStrategy } from "@/lib/ad-types";
import { limitBadgeWords } from "@/lib/badge-copy";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { CREATIVE_STYLE_IDS, resolveCreativeStyleId } from "@/lib/studio-styles";

type ProjectRow = {
  id: string;
  name: string | null;
  created_at: string | null;
  updated_at?: string | null;
  creatives_replace_at?: string | null;
  creatives_data?: unknown;
  strategy_data?: unknown;
  style_key?: string | null;
  accent_color?: string | null;
};

type GenerationPreviewSource = {
  id: string;
  createdAt: string | null;
  sets: string[][];
};

/** Preview plus its generation timestamp, for newest-first merging. */
type DatedPreview = {
  preview: AdsPreviewCreative;
  timestamp: number;
};

export async function listAdProjectCards(userId: string): Promise<AdsProjectCard[]> {
  const supabase = createSupabaseAdminClient();
  const full = await supabase
    .from("ad_projects")
    .select(
      "id, name, created_at, updated_at, creatives_replace_at, creatives_data, strategy_data, style_key, accent_color",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  let rows: ProjectRow[] | null = full.data as ProjectRow[] | null;
  if (full.error) {
    if (
      !/updated_at|creatives_replace_at|creatives_data|strategy_data|style_key|accent_color/i.test(
        full.error.message,
      )
    ) {
      throw new Error(full.error.message);
    }
    const basic = await supabase
      .from("ad_projects")
      .select("id, name, created_at, creatives_data")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (basic.error) throw new Error(basic.error.message);
    rows = (basic.data ?? []).map((row) => ({
      id: String(row.id),
      name: typeof row.name === "string" ? row.name : null,
      created_at: typeof row.created_at === "string" ? row.created_at : null,
      updated_at: typeof row.created_at === "string" ? row.created_at : null,
      creatives_replace_at: null,
      creatives_data: row.creatives_data ?? null,
      strategy_data: null,
      style_key: null,
      accent_color: null,
    }));
  }

  const projectIds = (rows ?? []).map((row) => String(row.id));
  /**
   * ALL generations per project (active + archived), newest first — no
   * `is_active` filter and no limit(1): card previews flatten creatives
   * from every generation. `createdAt` is kept per generation so merged
   * previews can be sorted newest-first across sources.
   */
  const generationsByProject = new Map<string, GenerationPreviewSource[]>();

  if (projectIds.length > 0) {
    const generations = await supabase
      .from("ad_generations")
      .select("id, project_id, images, is_active, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });

    if (!generations.error) {
      for (const row of generations.data ?? []) {
        const projectId = String(row.project_id);
        const sets = imageSetsFromGenerationImages(row.images);
        if (sets.length === 0) continue;
        const existing = generationsByProject.get(projectId) ?? [];
        existing.push({
          id: String(row.id),
          createdAt: typeof row.created_at === "string" ? row.created_at : null,
          sets,
        });
        generationsByProject.set(projectId, existing);
      }
    }
  }

  // Visible `ad_creatives` rows (deleted_at IS NULL only — soft-deleted
  // rows never reach previews).
  const visible = projectIds.length > 0 ? await listVisibleAdCreatives(supabase, projectIds) : null;
  const creativesByProject = new Map<string, AdCreativeRow[]>();
  if (visible?.extended) {
    for (const creativeRow of visible.rows) {
      const list = creativesByProject.get(creativeRow.project_id) ?? [];
      list.push(creativeRow);
      creativesByProject.set(creativeRow.project_id, list);
    }
  }

  // Generation ids that own ANY `ad_creatives` row (visible or soft-deleted).
  // Such generations are represented by their rows; only generations with no
  // rows at all (legacy, pre-`ad_creatives`) fall back to their image sets.
  // This keeps soft-deleted creatives from reappearing via generation images.
  const generationsWithRows = new Set<string>();
  if (visible?.extended && projectIds.length > 0) {
    for (const creativeRow of visible.rows) {
      if (creativeRow.generation_id) generationsWithRows.add(creativeRow.generation_id);
    }
    const anyRows = await supabase
      .from("ad_creatives")
      .select("generation_id")
      .in("project_id", projectIds)
      .not("generation_id", "is", null);
    if (!anyRows.error) {
      for (const raw of anyRows.data ?? []) {
        const generationId = (raw as { generation_id?: unknown }).generation_id;
        if (typeof generationId === "string") generationsWithRows.add(generationId);
      }
    }
  }

  return (rows ?? []).map((row) => {
    const id = String(row.id);
    const generations = generationsByProject.get(id) ?? [];
    const creativeRows = creativesByProject.get(id) ?? [];
    // Flat list across ALL generations (active + archived), newest first.
    const previewCreatives = buildMergedPreviews(row, creativeRows, generations, generationsWithRows);
    const fromCreativesUrls = imageUrlsFromCreativesData(row.creatives_data);
    const previewImages =
      previewCreatives.length > 0 ? previewCreatives.flatMap((preview) => preview.images) : fromCreativesUrls;

    return {
      id,
      name: typeof row.name === "string" && row.name.trim() ? row.name : "Без названия",
      updatedAt:
        typeof row.updated_at === "string"
          ? row.updated_at
          : typeof row.created_at === "string"
            ? row.created_at
            : null,
      creativesReplaceAt: typeof row.creatives_replace_at === "string" ? row.creatives_replace_at : null,
      previewImages,
      previewCreatives,
    };
  });
}

/**
 * Flatten creatives from ALL generations (active + archived) into a single
 * newest-first preview list:
 *  - generations that own `ad_creatives` rows contribute their visible rows
 *    (soft-deleted excluded by listVisibleAdCreatives);
 *  - legacy generations without any rows contribute their image sets.
 * Sources are merged and sorted by generation timestamp (created_at DESC),
 * so archived creatives always join the active ones instead of being
 * dropped whenever rows exist.
 */
function buildMergedPreviews(
  row: ProjectRow,
  creativeRows: AdCreativeRow[],
  generations: GenerationPreviewSource[],
  generationsWithRows: Set<string>,
): AdsPreviewCreative[] {
  const fallbackStyle =
    resolveCreativeStyleId(typeof row.style_key === "string" ? row.style_key : null) ??
    CREATIVE_STYLE_IDS.beforeAfterVs;
  const fallbackAccent = resolveAccentHex(row.accent_color, DEFAULT_ACCENT_COLOR);
  const strategy = parseAdStrategy(row.strategy_data);

  const dated: DatedPreview[] = buildPreviewItemsFromCreativeRows(row, creativeRows);

  let legacyIndex = dated.length;
  for (const generation of generations) {
    // Represented by ad_creatives rows — never duplicate via image sets,
    // and never resurrect soft-deleted rows through them.
    if (generationsWithRows.has(generation.id)) continue;
    const timestamp = generation.createdAt ? Date.parse(generation.createdAt) : 0;
    for (const images of generation.sets) {
      dated.push({
        preview: previewFromStrategy(images, legacyIndex, fallbackStyle, fallbackAccent, strategy),
        timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
      });
      legacyIndex += 1;
    }
  }

  // Newest first; Array.sort is stable, so same-timestamp items keep their
  // source order (rows by sort_index, sets by generation order).
  dated.sort((a, b) => b.timestamp - a.timestamp);

  if (dated.length > 0) return dated.map((item) => item.preview);
  return previewFromCreativesData(row.creatives_data, fallbackStyle, fallbackAccent, strategy);
}

function buildPreviewItemsFromCreativeRows(row: ProjectRow, creativeRows: AdCreativeRow[]): DatedPreview[] {
  const fallbackStyle =
    resolveCreativeStyleId(typeof row.style_key === "string" ? row.style_key : null) ??
    CREATIVE_STYLE_IDS.beforeAfterVs;
  const fallbackAccent = resolveAccentHex(row.accent_color, DEFAULT_ACCENT_COLOR);
  const strategy = parseAdStrategy(row.strategy_data);
  const hook = strategy?.strategy.hook_concept ?? "";

  // Rows arrive newest-first; keep generation order via sort_index inside a batch.
  return creativeRows.flatMap((creativeRow, index) => {
    const images = creativeRowImages(creativeRow);
    if (images.length === 0) return [];
    const texts = creativeRow.texts;
    const timestamp = creativeRow.created_at ? Date.parse(creativeRow.created_at) : 0;
    return [
      {
        timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
        preview: {
        images,
        headline:
          texts?.headline?.trim() ||
          creativeRow.headline?.trim() ||
          strategy?.creatives.headlines[index % Math.max(strategy?.creatives.headlines.length ?? 1, 1)] ||
          hook ||
          "Оффер",
        subheadline:
          texts?.subheadline?.trim() ||
          creativeRow.body_text?.trim() ||
          strategy?.creatives.subheadlines[index % Math.max(strategy?.creatives.subheadlines.length ?? 1, 1)] ||
          strategy?.strategy.core_offer_angle ||
          undefined,
        bullets: strategy?.creatives.benefits?.length
          ? strategy.creatives.benefits.slice(0, 4)
          : texts?.benefit?.trim()
            ? [texts.benefit.trim()]
            : ["Результат без хаоса"],
        badge: (texts?.badge ? limitBadgeWords(texts.badge) : "") || limitBadgeWords(hook) || "Оффер",
        buttonText:
          texts?.cta?.trim() ||
          strategy?.creatives.buttons[index % Math.max(strategy?.creatives.buttons.length ?? 1, 1)] ||
          "Узнать подробнее",
        styleKey: resolveCreativeStyleId(creativeRow.style_id) ?? fallbackStyle,
        accentColor: resolveAccentHex(creativeRow.accent_color, fallbackAccent),
        },
      },
    ];
  });
}

function previewFromCreativesData(
  value: unknown,
  fallbackStyle: string,
  fallbackAccent: string,
  strategy: AdStrategy | null,
): AdsPreviewCreative[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const row = item as AdCreative;
    const images = (
      Array.isArray(row.image_urls) && row.image_urls.length > 0
        ? row.image_urls
        : typeof row.image_url === "string"
          ? [row.image_url]
          : []
    )
      .map((url) => (typeof url === "string" ? url.trim() : ""))
      .filter((url) => isRealCreativeImageUrl(url));
    if (images.length === 0) return [];

    const texts = row.texts ?? { headline: "", subheadline: "", benefit: "", cta: "" };
    const hook = strategy?.strategy.hook_concept ?? "";
    const badge =
      (typeof (texts as { badge?: unknown }).badge === "string"
        ? limitBadgeWords((texts as { badge: string }).badge)
        : "") ||
      limitBadgeWords(hook) ||
      "Оффер";

    return [
      {
        images,
        headline:
          texts.headline?.trim() ||
          strategy?.creatives.headlines[index % Math.max(strategy.creatives.headlines.length, 1)] ||
          hook ||
          "Оффер",
        subheadline:
          texts.subheadline?.trim() ||
          strategy?.creatives.subheadlines[index % Math.max(strategy?.creatives.subheadlines.length ?? 1, 1)] ||
          strategy?.strategy.core_offer_angle ||
          undefined,
        bullets: strategy?.creatives.benefits?.length
          ? strategy.creatives.benefits.slice(0, 4)
          : texts.benefit
            ? [texts.benefit]
            : ["Результат без хаоса"],
        badge,
        buttonText:
          texts.cta?.trim() ||
          strategy?.creatives.buttons[index % Math.max(strategy?.creatives.buttons.length ?? 1, 1)] ||
          "Узнать подробнее",
        styleKey:
          resolveCreativeStyleId(typeof row.style_id === "string" ? row.style_id : null) ?? fallbackStyle,
        accentColor: resolveAccentHex(row.accent_color, fallbackAccent),
      },
    ];
  });
}

function previewFromStrategy(
  images: string[],
  index: number,
  styleKey: string,
  accentColor: string,
  strategy: AdStrategy | null,
): AdsPreviewCreative {
  const headlines = strategy?.creatives.headlines ?? [];
  const subheadlines = strategy?.creatives.subheadlines ?? [];
  const benefits = strategy?.creatives.benefits ?? [];
  const buttons = strategy?.creatives.buttons ?? [];
  const hook = strategy?.strategy.hook_concept ?? "";

  return {
    images,
    headline: headlines[index % Math.max(headlines.length, 1)] ?? (hook || "Оффер"),
    subheadline:
      subheadlines[index % Math.max(subheadlines.length, 1)] ?? strategy?.strategy.core_offer_angle ?? undefined,
    bullets: benefits.length > 0 ? benefits.slice(0, 4) : [strategy?.strategy.core_offer_angle ?? "Результат без хаоса"],
    badge: limitBadgeWords(hook) || "Оффер",
    buttonText: buttons[index % Math.max(buttons.length, 1)] ?? "Узнать подробнее",
    styleKey,
    accentColor,
  };
}
