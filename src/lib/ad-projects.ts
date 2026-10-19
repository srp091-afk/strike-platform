import "server-only";

import { DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import { parseAdStrategy } from "@/lib/ad-strategy";
import {
  imageSetsFromCreativesData,
  imageSetsFromGenerationImages,
  imageUrlsFromCreativesData,
  imageUrlsFromGenerationImages,
  isRealCreativeImageUrl,
} from "@/lib/ad-project-media";
import type { AdsPreviewCreative, AdsProjectCard } from "@/lib/ad-project-types";
import type { AdCreative, AdStrategy } from "@/lib/ad-types";
import { limitBadgeWords } from "@/lib/badge-copy";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { SPLIT_VS_STYLE_KEY } from "@/lib/studio-styles";

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
  const activeSetsByProject = new Map<string, string[][]>();
  const anySetsByProject = new Map<string, string[][]>();

  if (projectIds.length > 0) {
    const generations = await supabase
      .from("ad_generations")
      .select("project_id, images, is_active, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });

    if (!generations.error) {
      for (const row of generations.data ?? []) {
        const projectId = String(row.project_id);
        const sets = imageSetsFromGenerationImages(row.images);
        if (sets.length === 0) continue;
        if (!anySetsByProject.has(projectId)) {
          anySetsByProject.set(projectId, sets);
        }
        if (row.is_active === true && !activeSetsByProject.has(projectId)) {
          activeSetsByProject.set(projectId, sets);
        }
      }
    }
  }

  return (rows ?? []).map((row) => {
    const id = String(row.id);
    const generationSets = activeSetsByProject.get(id) ?? anySetsByProject.get(id) ?? [];
    const fromCreativesUrls = imageUrlsFromCreativesData(row.creatives_data);
    const fromGenerationUrls = generationSets.flat();
    const previewImages = fromGenerationUrls.length > 0 ? fromGenerationUrls : fromCreativesUrls;
    const previewCreatives = buildPreviewCreatives(row, generationSets);

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

function buildPreviewCreatives(row: ProjectRow, generationSets: string[][]): AdsPreviewCreative[] {
  const styleKey =
    typeof row.style_key === "string" && row.style_key.trim() ? row.style_key.trim() : SPLIT_VS_STYLE_KEY;
  const accentColor = resolveAccentHex(row.accent_color, DEFAULT_ACCENT_COLOR);
  const strategy = parseAdStrategy(row.strategy_data);
  const fromData = previewFromCreativesData(row.creatives_data, styleKey, accentColor, strategy);
  if (fromData.length > 0) return fromData.slice(0, 6);

  const creativeSets =
    generationSets.length > 0 ? generationSets : imageSetsFromCreativesData(row.creatives_data);
  return creativeSets.slice(0, 6).map((images, index) => previewFromStrategy(images, index, styleKey, accentColor, strategy));
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
        styleKey: typeof row.style_id === "string" && row.style_id.trim() ? row.style_id : fallbackStyle,
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
