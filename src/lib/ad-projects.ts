import "server-only";

import { imageUrlsFromGenerationImages } from "@/lib/ad-project-media";
import type { AdsProjectCard } from "@/lib/ad-project-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type ProjectRow = {
  id: string;
  name: string | null;
  created_at: string | null;
  updated_at?: string | null;
  creatives_replace_at?: string | null;
};

export async function listAdProjectCards(userId: string): Promise<AdsProjectCard[]> {
  const supabase = createSupabaseAdminClient();
  const full = await supabase
    .from("ad_projects")
    .select("id, name, created_at, updated_at, creatives_replace_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  let rows: ProjectRow[] | null = full.data as ProjectRow[] | null;
  if (full.error) {
    if (!/updated_at|creatives_replace_at/i.test(full.error.message)) {
      throw new Error(full.error.message);
    }
    const basic = await supabase
      .from("ad_projects")
      .select("id, name, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (basic.error) throw new Error(basic.error.message);
    rows = (basic.data ?? []).map((row) => ({
      id: String(row.id),
      name: typeof row.name === "string" ? row.name : null,
      created_at: typeof row.created_at === "string" ? row.created_at : null,
      updated_at: typeof row.created_at === "string" ? row.created_at : null,
      creatives_replace_at: null,
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
      previewImages: previewByProject.get(id) ?? [],
    };
  });
}
