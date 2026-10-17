import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";

import { CampaignDashboard, type ProjectStatus } from "@/components/campaign-dashboard";
import type { AdCreative, AdGeneration, AdGenerationStatus, AdStrategy } from "@/lib/ad-types";
import { parseAdStrategy } from "@/lib/ad-strategy";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { studioStyles } from "@/lib/studio-styles";
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

  let project: { name: string; strategy: AdStrategy | null; status: ProjectStatus } | null = null;
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
      name={project.name}
      strategy={project.strategy}
      status={project.status}
      generations={generations}
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

function readImages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const url = typeof item === "string" ? item.trim() : "";
    return url ? [url] : [];
  });
}

function readGeneration(row: Record<string, unknown>, projectId: string): AdGeneration | null {
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) return null;
  const title = typeof row.title === "string" && row.title.trim() ? row.title.trim() : "Генерация";
  const styleName = typeof row.style_name === "string" && row.style_name.trim() ? row.style_name.trim() : "Без стиля";
  const createdAt = typeof row.created_at === "string" ? row.created_at : "";
  return {
    id,
    project_id: typeof row.project_id === "string" ? row.project_id : projectId,
    title,
    style_name: styleName,
    status: readGenerationStatus(row.status),
    is_active: row.is_active === true,
    images: readImages(row.images),
    created_at: createdAt,
  };
}

async function loadProjectRow(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  id: string,
  userId: string,
) {
  const full = await supabase
    .from("ad_projects")
    .select("id, name, status, strategy_data, creatives_data, style_key")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!full.error) return full.data;
  if (/creatives_data|style_key/i.test(full.error.message) && !/strategy_data/i.test(full.error.message)) {
    const mid = await supabase
      .from("ad_projects")
      .select("id, name, status, strategy_data")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!mid.error && mid.data) return { ...mid.data, creatives_data: null, style_key: null };
    if (mid.error && !/strategy_data/i.test(mid.error.message)) throw new Error(mid.error.message);
  }
  if (!/strategy_data/i.test(full.error.message)) throw new Error(full.error.message);

  const basic = await supabase
    .from("ad_projects")
    .select("id, name, status")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (basic.error) throw new Error(basic.error.message);
  if (!basic.data) return null;
  return { ...basic.data, strategy_data: null, creatives_data: null, style_key: null };
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

  // Fallback: older runs saved only ad_projects.creatives_data (image_url[]), not ad_generations.
  if (!generations.some((generation) => generation.is_active && generation.images.length > 0)) {
    const styleKey = typeof data.style_key === "string" ? data.style_key : "";
    const styleName = studioStyles.find((style) => style.key === styleKey)?.name ?? "Студия";
    const fromCreatives = generationFromCreativesData(data.creatives_data, projectId, styleName);
    if (fromCreatives) generations = [fromCreatives, ...generations];
  }

  return {
    project: {
      name: typeof data.name === "string" && data.name.trim() ? data.name : "Без названия",
      strategy: parseAdStrategy(data.strategy_data),
      status: readStatus(data.status),
    },
    generations,
  };
}

function generationFromCreativesData(
  value: unknown,
  projectId: string,
  styleName: string,
): AdGeneration | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const images = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const url = (item as AdCreative).image_url;
    return typeof url === "string" && /^https?:\/\//i.test(url.trim()) ? [url.trim()] : [];
  });
  if (images.length === 0) return null;
  return {
    id: `creatives-data-${projectId}`,
    project_id: projectId,
    title: "Генерация креативов",
    style_name: styleName,
    status: "ready",
    is_active: true,
    images,
    created_at: new Date().toISOString(),
  };
}
