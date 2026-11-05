import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { SMM_PROJECT_ID_PATTERN, type SmmProject } from "@/lib/smm-project-types";

/** Проект пользователя или null: чужие и несуществующие проекты неотличимы (нет утечки существования). */
export async function getOwnedProject(userId: string, projectId: string): Promise<SmmProject | null> {
  if (!SMM_PROJECT_ID_PATTERN.test(projectId)) return null;
  const { data, error } = await createSupabaseAdminClient()
    .from("smm_projects")
    .select("id, name, avatar_url, created_at")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ({ id: String(data.id), name: String(data.name), avatar_url: (data.avatar_url as string | null) ?? null, created_at: String(data.created_at) }) : null;
}
