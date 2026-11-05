"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getOwnedProject } from "@/lib/smm-projects";
import {
  SMM_BRAND_COLOR_PATTERN,
  SMM_BRAND_FONTS,
  SMM_BRAND_TEXT_MAX,
  SMM_PROJECTS_LIMIT,
  SMM_PROJECT_NAME_MAX,
  type SmmProject,
  type SmmProjectSettings,
} from "@/lib/smm-project-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Failure = { ok: false; error: string };

function failure(error: unknown): Failure {
  return { ok: false, error: error instanceof Error ? error.message : "Не удалось выполнить действие." };
}

function friendly(message: string) {
  return message.includes("smm_projects") || message.includes("brand_") || message.includes("tone_of_voice") ? "Примените миграции 20261106_smm_projects.sql и 20261106_project_brand_settings.sql в Supabase." : message;
}

export async function getProjects(): Promise<{ ok: true; projects: SmmProject[] } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const { data, error } = await createSupabaseAdminClient()
      .from("smm_projects")
      .select("id, name, avatar_url, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return { ok: false, error: friendly(error.message) };
    return {
      ok: true,
      projects: (data ?? []).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        avatar_url: (row.avatar_url as string | null) ?? null,
        created_at: String(row.created_at),
      })),
    };
  } catch (error) {
    return failure(error);
  }
}

/** Создаёт проект и возвращает его id: клиент сразу переходит на /smm/p/[id]/settings. */
export async function createProject(name: string): Promise<{ ok: true; id: string } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const clean = String(name ?? "").trim().replace(/\s+/g, " ");
    if (!clean) return { ok: false, error: "Введите название проекта." };
    if (clean.length > SMM_PROJECT_NAME_MAX) return { ok: false, error: `Название слишком длинное: максимум ${SMM_PROJECT_NAME_MAX} символов.` };

    const supabase = createSupabaseAdminClient();
    const { count, error: countError } = await supabase
      .from("smm_projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    if (countError) return { ok: false, error: friendly(countError.message) };
    if ((count ?? 0) >= SMM_PROJECTS_LIMIT) return { ok: false, error: `Достигнут лимит проектов: ${SMM_PROJECTS_LIMIT}.` };

    const { data, error } = await supabase.from("smm_projects").insert({ user_id: userId, name: clean }).select("id").single();
    if (error || !data) return { ok: false, error: friendly(error?.message ?? "Не удалось создать проект.") };
    revalidatePath("/smm");
    return { ok: true, id: String(data.id) };
  } catch (error) {
    return failure(error);
  }
}

/** Удаляет проект вместе с интеграциями, стратегией и постами (on delete cascade). */
export async function deleteProject(projectId: string): Promise<{ ok: true } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await getOwnedProject(userId, String(projectId));
    if (!project) return { ok: false, error: "Проект не найден." };
    const { error } = await createSupabaseAdminClient().from("smm_projects").delete().eq("id", project.id).eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    revalidatePath("/smm");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function getProjectSettings(projectId: string): Promise<{ ok: true; settings: SmmProjectSettings } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await getOwnedProject(userId, String(projectId));
    if (!project) return { ok: false, error: "Проект не найден." };
    const { data, error } = await createSupabaseAdminClient()
      .from("smm_projects")
      .select("tone_of_voice, target_audience, brand_color, brand_font")
      .eq("id", project.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false, error: friendly(error.message) };
    return {
      ok: true,
      settings: {
        toneOfVoice: String(data?.tone_of_voice ?? ""),
        targetAudience: String(data?.target_audience ?? ""),
        brandColor: String(data?.brand_color ?? "#000000"),
        brandFont: String(data?.brand_font ?? "Inter"),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function updateProjectSettings(projectId: string, data: SmmProjectSettings): Promise<{ ok: true; settings: SmmProjectSettings } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await getOwnedProject(userId, String(projectId));
    if (!project) return { ok: false, error: "Проект не найден." };

    const toneOfVoice = String(data?.toneOfVoice ?? "").trim();
    const targetAudience = String(data?.targetAudience ?? "").trim();
    const brandColor = String(data?.brandColor ?? "").trim();
    const brandFont = String(data?.brandFont ?? "").trim();
    if (toneOfVoice.length > SMM_BRAND_TEXT_MAX || targetAudience.length > SMM_BRAND_TEXT_MAX) {
      return { ok: false, error: `Текст слишком длинный: максимум ${SMM_BRAND_TEXT_MAX} символов.` };
    }
    if (!SMM_BRAND_COLOR_PATTERN.test(brandColor)) return { ok: false, error: "Некорректный цвет: ожидается формат #RRGGBB." };
    if (!(SMM_BRAND_FONTS as readonly string[]).includes(brandFont)) return { ok: false, error: "Недопустимый шрифт." };

    const { error } = await createSupabaseAdminClient()
      .from("smm_projects")
      .update({
        tone_of_voice: toneOfVoice || null,
        target_audience: targetAudience || null,
        brand_color: brandColor.toLowerCase(),
        brand_font: brandFont,
      })
      .eq("id", project.id)
      .eq("user_id", userId);
    if (error) return { ok: false, error: friendly(error.message) };
    revalidatePath(`/smm/p/${project.id}/settings`);
    return { ok: true, settings: { toneOfVoice, targetAudience, brandColor: brandColor.toLowerCase(), brandFont } };
  } catch (error) {
    return failure(error);
  }
}
