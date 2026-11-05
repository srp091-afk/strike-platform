"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getOwnedProject } from "@/lib/smm-projects";
import { isVideoUrl, type SmmAssetItem, type SmmAssetType } from "@/lib/smm-asset-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Failure = { ok: false; error: string };

const BUCKET = "smm_media";

export async function getProjectAssets(projectId: string): Promise<{ ok: true; assets: SmmAssetItem[] } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await getOwnedProject(userId, String(projectId));
    if (!project) return { ok: false, error: "Проект не найден." };
    const { data, error } = await createSupabaseAdminClient()
      .from("smm_assets")
      .select("id, file_url, asset_type, created_at")
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      assets: (data ?? []).map((row) => ({
        id: String(row.id),
        fileUrl: String(row.file_url),
        assetType: (row.asset_type === "ai_generated" ? "ai_generated" : "user_upload") as SmmAssetType,
        isVideo: isVideoUrl(String(row.file_url)),
        createdAt: String(row.created_at),
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось загрузить медиатеку." };
  }
}

/** Удаляет запись и файл. Путь в бакете берём из записи БД (а не из клиента), владельца проверяем по user_id. */
export async function deleteAsset(assetId: string, fileUrl: string): Promise<{ ok: true } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!/^[0-9a-f-]{36}$/i.test(String(assetId))) return { ok: false, error: "Файл не найден." };
    const supabase = createSupabaseAdminClient();
    const { data: asset } = await supabase
      .from("smm_assets")
      .select("id, project_id, file_url, storage_path")
      .eq("id", assetId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!asset) return { ok: false, error: "Файл не найден." };
    const project = await getOwnedProject(userId, String(asset.project_id));
    if (!project) return { ok: false, error: "Файл не найден." };

    // storage_path из БД; запасной вариант — путь из сохранённого file_url (fileUrl клиента должен совпадать с записью)
    let path = asset.storage_path ? String(asset.storage_path) : "";
    if (!path) {
      const marker = `/object/public/${BUCKET}/`;
      const stored = String(asset.file_url);
      const idx = stored.indexOf(marker);
      if (idx >= 0 && (!fileUrl || fileUrl === stored)) path = decodeURIComponent(stored.slice(idx + marker.length).split("?")[0]);
    }

    if (path) {
      const { error: rmError } = await supabase.storage.from(BUCKET).remove([path]);
      if (rmError) return { ok: false, error: `Не удалось удалить файл из хранилища: ${rmError.message}` };
    }
    const { error } = await supabase.from("smm_assets").delete().eq("id", asset.id).eq("user_id", userId);
    if (error) return { ok: false, error: error.message };

    // убираем ссылку на файл из постов проекта
    const { data: posts } = await supabase
      .from("smm_posts")
      .select("id, media_urls")
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .contains("media_urls", [String(asset.file_url)]);
    for (const p of posts ?? []) {
      const next = (Array.isArray(p.media_urls) ? (p.media_urls as string[]) : []).filter((u) => u !== String(asset.file_url));
      await supabase.from("smm_posts").update({ media_urls: next }).eq("id", p.id).eq("user_id", userId);
    }

    revalidatePath(`/smm/p/${project.id}/assets`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Не удалось удалить файл." };
  }
}