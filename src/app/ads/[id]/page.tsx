import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";

import { CampaignDashboard, type ProjectStatus } from "@/components/campaign-dashboard";
import type { AdGeneration, AdGenerationCreative, AdGenerationStatus, AdStrategy } from "@/lib/ad-types";
import { creativeRowImages, listVisibleAdCreatives, type AdCreativeRow } from "@/lib/ad-creatives";
import { parseAdStrategy } from "@/lib/ad-strategy";
import { resolveCreativeFormat } from "@/lib/creative-format";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { imageSetsFromCreativesData, imageSetsFromGenerationImages } from "@/lib/ad-project-media";
import { resolveCreativeStyleId, resolveStudioStyleKey, studioStyles } from "@/lib/studio-styles";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const metadata: Metadata = {
  title: "AI-кампания",
};

export default function AdProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="mx-auto h-80 max-w-7xl px-6 py-10" />}>
      <AdProjectResult params={params} />
    </Suspense>
  );
}

async function AdProjectResult({ params }: { params: Promise<{ id: string }> }) {
  await io();
  const { id } = await params;

  let project: {
    id: string;
    name: string;
    strategy: AdStrategy | null;
    status: ProjectStatus;
    updatedAt: string | null;
    creativesReplaceAt: string | null;
    styleKey: string | null;
    accentColor: string | null;
    fontStyle: string | null;
  } | null = null;
  let generations: AdGeneration[] = [];
  let error: string | null = null;

  try {
    const loaded = await loadProject(id);
    project = loaded.project;
    generations = loaded.generations;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Не удалось загрузить проект.";
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-10">
        <Link href="/ads" className="text-sm text-zinc-400 hover:text-white">
          ← Все кампании
        </Link>
        <p className="mt-6 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">{error}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-10">
        <Link href="/ads" className="text-sm text-zinc-400 hover:text-white">
          ← Все кампании
        </Link>
        <p className="mt-6 text-sm text-zinc-400">Проект не найден.</p>
      </div>
    );
  }

  return (
    <CampaignDashboard
      projectId={project.id}
      name={project.name}
      strategy={project.strategy}
      status={project.status}
      generations={generations}
      updatedAt={project.updatedAt}
      creativesReplaceAt={project.creativesReplaceAt}
      styleKey={project.styleKey}
      accentColor={project.accentColor}
      fontStyle={project.fontStyle}
    />
  );
}

function readStatus(value: unknown): ProjectStatus {
  if (value === "processing" || value === "error" || value === "ready") return value;
  return "ready";
}

function readGenerationStatus(value: unknown): AdGenerationStatus {
  if (value === "processing" || value === "ready" || value === "error") return value;
  return "processing";
}

function readGeneration(row: Record<string, unknown>, projectId: string): AdGeneration | null {
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) return null;
  const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Генерация";
  const styleName = typeof row.style_name === "string" && row.style_name.trim() ? row.style_name.trim() : "Без стиля";
  const createdAt = typeof row.created_at === "string" ? row.created_at : "";
  const imageSets = imageSetsFromGenerationImages(row.images);
  return {
    id,
    project_id: typeof row.project_id === "string" ? row.project_id : projectId,
    title,
    style_name: styleName,
    status: readGenerationStatus(row.status),
    is_active: row.is_active === true,
    // Format state (post-migration column; legacy rows resolve to 4:5).
    aspect_ratio: resolveCreativeFormat(row.aspect_ratio, "4:5"),
    images: imageSets.flat(),
    imageSets,
    created_at: createdAt,
  };
}

function creativeRowToCard(row: AdCreativeRow, strategyBenefits: string[] = []): AdGenerationCreative {
  const texts = row.texts;
  // Templates render the full bullets array (3–4): the strategy benefits
  // list is the source; the row's single `benefit` is only a fallback.
  const bullets =
    strategyBenefits.length > 0
      ? strategyBenefits.slice(0, 4)
      : texts?.benefit?.trim()
        ? [texts.benefit.trim()]
        : [];
  return {
    id: row.id,
    images: creativeRowImages(row),
    headline: texts?.headline?.trim() || row.headline?.trim() || "",
    subheadline: texts?.subheadline?.trim() || row.body_text?.trim() || undefined,
    bullets,
    badge: texts?.badge?.trim() || undefined,
    buttonText: texts?.cta?.trim() || "Узнать подробнее",
    styleId: row.style_id,
    accentColor: row.accent_color ?? undefined,
    format: row.aspect_ratio,
  };
}

async function loadProjectRow(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  id: string,
  userId: string,
) {
  const full = await supabase
    .from("ad_projects")
    .select(
      "id, name, status, strategy_data, creatives_data, style_key, accent_color, font_style, updated_at, creatives_replace_at, created_at",
    )
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!full.error) return full.data;
  if (
    /creatives_data|style_key|accent_color|font_style|updated_at|creatives_replace_at/i.test(full.error.message) &&
    !/strategy_data/i.test(full.error.message)
  ) {
    const mid = await supabase
      .from("ad_projects")
      .select("id, name, status, strategy_data, created_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!mid.error && mid.data) {
      return {
        ...mid.data,
        creatives_data: null,
        style_key: null,
        accent_color: null,
        font_style: null,
        updated_at: mid.data.created_at,
        creatives_replace_at: null,
      };
    }
    if (mid.error && !/strategy_data/i.test(mid.error.message)) throw new Error(mid.error.message);
  }
  if (!/strategy_data/i.test(full.error.message)) throw new Error(full.error.message);

  const basic = await supabase
    .from("ad_projects")
    .select("id, name, status, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (basic.error) throw new Error(basic.error.message);
  if (!basic.data) return null;
  return {
    ...basic.data,
    strategy_data: null,
    creatives_data: null,
    style_key: null,
    accent_color: null,
    font_style: null,
    updated_at: basic.data.created_at,
    creatives_replace_at: null,
  };
}

async function loadProject(id: string) {
  const userId = await getAuthenticatedUserId();
  const supabase = createSupabaseAdminClient();
  const data = await loadProjectRow(supabase, id, userId);
  if (!data) return { project: null, generations: [] as AdGeneration[] };

  const projectId = String(data.id);
  const generationsResult = await supabase
    .from("ad_generations")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (generationsResult.error) throw new Error(generationsResult.error.message);

  let generations = (generationsResult.data ?? []).flatMap((row) => {
    const generation = readGeneration(row, projectId);
    return generation ? [generation] : [];
  });

  // Creative cards come from `ad_creatives` (soft delete: deleted_at IS NULL).
  // Generations with rows render from them; legacy generations keep `images`.
  const visible = await listVisibleAdCreatives(supabase, [projectId]);
  if (visible.extended && visible.rows.length > 0) {
    const byGeneration = new Map<string, AdCreativeRow[]>();
    for (const row of visible.rows) {
      if (!row.generation_id) continue;
      const list = byGeneration.get(row.generation_id) ?? [];
      list.push(row);
      byGeneration.set(row.generation_id, list);
    }
    for (const generation of generations) {
      const rows = (byGeneration.get(generation.id) ?? []).sort((a, b) => a.sort_index - b.sort_index);
      if (rows.length === 0) continue;
      const strategyBenefits = (parseAdStrategy(data.strategy_data)?.creatives.benefits ?? []).filter(
        (benefit) => benefit.trim().length > 0,
      );
      generation.creatives = rows.map((row) => creativeRowToCard(row, strategyBenefits));
      generation.imageSets = generation.creatives.map((creative) => creative.images);
      generation.images = generation.imageSets.flat();
    }
  }

  // Prefer structured pairs from creatives_data when the active generation only has a flat URL list.
  const active = generations.find((generation) => generation.is_active);
  if (active && !active.creatives?.length && active.imageSets.every((set) => set.length < 2)) {
    const fromCreatives = imageSetsFromCreativesData(data.creatives_data);
    if (fromCreatives.some((set) => set.length >= 2)) {
      active.imageSets = fromCreatives;
      active.images = fromCreatives.flat();
    }
  }

  // Fallback: older runs saved only ad_projects.creatives_data, not ad_generations.
  if (!generations.some((generation) => generation.is_active && generation.imageSets.length > 0)) {
    const styleKeyRaw = typeof data.style_key === "string" ? data.style_key : "";
    const canonicalStyle = resolveStudioStyleKey(styleKeyRaw);
    const styleName =
      studioStyles.find((style) => style.key === canonicalStyle)?.name ?? "Студия";
    const fromCreatives = generationFromCreativesData(data.creatives_data, projectId, styleName);
    if (fromCreatives) generations = [fromCreatives, ...generations];
  }

  return {
    project: {
      id: projectId,
      name: typeof data.name === "string" && data.name.trim() ? data.name : "Без названия",
      strategy: parseAdStrategy(data.strategy_data),
      status: readStatus(data.status),
      updatedAt:
        typeof data.updated_at === "string"
          ? data.updated_at
          : typeof data.created_at === "string"
            ? data.created_at
            : null,
      creativesReplaceAt: typeof data.creatives_replace_at === "string" ? data.creatives_replace_at : null,
      styleKey:
        typeof data.style_key === "string"
          ? (resolveCreativeStyleId(data.style_key) ?? data.style_key)
          : null,
      accentColor: readAccentColor(data.accent_color, data.creatives_data),
      fontStyle: typeof data.font_style === "string" && data.font_style.trim() ? data.font_style.trim() : null,
    },
    generations,
  };
}

function readAccentColor(column: unknown, creativesData: unknown): string | null {
  if (typeof column === "string" && column.trim()) return column.trim();
  if (!Array.isArray(creativesData) || creativesData.length === 0) return null;
  const first = creativesData[0];
  if (!first || typeof first !== "object") return null;
  const accent = (first as { accent_color?: unknown }).accent_color;
  return typeof accent === "string" && accent.trim() ? accent.trim() : null;
}

function generationFromCreativesData(
  value: unknown,
  projectId: string,
  styleName: string,
): AdGeneration | null {
  const imageSets = imageSetsFromCreativesData(value);
  if (imageSets.length === 0) return null;
  const firstCreative = Array.isArray(value) ? value[0] : null;
  return {
    id: `creatives-data-${projectId}`,
    project_id: projectId,
    title: "Генерация креативов",
    style_name: styleName,
    status: "ready",
    is_active: true,
    // creatives_data stamps aspect_ratio per creative (JSON, always stored).
    aspect_ratio: resolveCreativeFormat(
      firstCreative && typeof firstCreative === "object"
        ? (firstCreative as { aspect_ratio?: unknown }).aspect_ratio
        : null,
      "4:5",
    ),
    images: imageSets.flat(),
    imageSets,
    created_at: new Date().toISOString(),
  };
}
