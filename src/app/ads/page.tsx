import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";
import Link from "next/link";

import { AdsProjectsList, type AdsProjectCard } from "@/components/ads-projects-list";
import { Button } from "@/components/ui/button";
import { imageUrlsFromCreativesData, imageUrlsFromGenerationImages } from "@/lib/ad-project-media";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const metadata: Metadata = {
  title: "AI-Кампании",
};

export default function AdsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-white">AI-Кампании</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Создавайте и запускайте прибыльные рекламные кампании в Meta, Google и TikTok с помощью ИИ-автоматизации.
          </p>
        </div>
        <Button asChild className="shrink-0 bg-white text-black hover:bg-zinc-200 hover:shadow-none">
          <Link href="/ads/new">+ Новый проект</Link>
        </Button>
      </header>

      <Suspense fallback={<div className="mt-10 h-48 rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
        <AdsList />
      </Suspense>
    </div>
  );
}

async function AdsList() {
  await io();

  let projects: AdsProjectCard[] = [];
  let error: string | null = null;
  try {
    const userId = await getAuthenticatedUserId();
    projects = await listAdProjects(userId);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Не удалось загрузить проекты.";
  }

  if (error) {
    return (
      <p className="mt-10 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">{error}</p>
    );
  }

  return <AdsProjectsList initialProjects={projects} />;
}

async function listAdProjects(userId: string): Promise<AdsProjectCard[]> {
  const supabase = createSupabaseAdminClient();
  const full = await supabase
    .from("ad_projects")
    .select("id, name, created_at, updated_at, creatives_replace_at, creatives_data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  let rows = full.data;
  if (full.error) {
    if (!/updated_at|creatives_replace_at|creatives_data/i.test(full.error.message)) {
      throw new Error(full.error.message);
    }
    const basic = await supabase
      .from("ad_projects")
      .select("id, name, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (basic.error) throw new Error(basic.error.message);
    rows = (basic.data ?? []).map((row) => ({
      ...row,
      updated_at: row.created_at,
      creatives_replace_at: null,
      creatives_data: null,
    }));
  }

  const projectIds = (rows ?? []).map((row) => String(row.id));
  const previewByProject = new Map<string, string[]>();

  if (projectIds.length > 0) {
    const generations = await supabase
      .from("ad_generations")
      .select("project_id, images, is_active, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false });

    if (!generations.error) {
      for (const row of generations.data ?? []) {
        const projectId = String(row.project_id);
        if (previewByProject.has(projectId)) continue;
        if (row.is_active !== true) continue;
        const images = imageUrlsFromGenerationImages(row.images);
        if (images.length > 0) previewByProject.set(projectId, images);
      }
    }
  }

  return (rows ?? []).map((row) => {
    const id = String(row.id);
    const fromGeneration = previewByProject.get(id) ?? [];
    const fromCreatives = imageUrlsFromCreativesData(row.creatives_data);
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
      previewImages: fromGeneration.length > 0 ? fromGeneration : fromCreatives,
    };
  });
}
