"use server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getOwnedProject } from "@/lib/smm-projects";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  DEFAULT_SMM_STRATEGY,
  SMM_DAYS,
  SMM_TONES,
  type SmmPostItem,
  type SmmStrategyState,
  type SmmStudioState,
} from "@/lib/smm-types";

/*
 * Все запросы идут через service_role только после getAuthenticatedUserId(),
 * и каждая выборка/запись жёстко фильтруется по user_id вошедшего пользователя.
 * Ключи API никогда не возвращаются в браузер в открытом виде: клиент получает только маску.
 */

export type SmmActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_DESCRIPTION = 4000;

function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "Не удалось выполнить действие." };
}

function readStrategy(row: Record<string, unknown> | null): SmmStrategyState {
  if (!row) return DEFAULT_SMM_STRATEGY;
  const schedule = (row.posting_schedule ?? {}) as { days?: unknown; time?: unknown };
  const days = Array.isArray(schedule.days)
    ? schedule.days.filter((day): day is string => typeof day === "string" && SMM_DAYS.includes(day as never))
    : DEFAULT_SMM_STRATEGY.days;
  const tone = SMM_TONES.includes(row.tone_of_voice as never) ? (row.tone_of_voice as string) : DEFAULT_SMM_STRATEGY.tone;
  return {
    description: typeof row.project_description === "string" ? row.project_description : "",
    tone,
    days,
    time: typeof schedule.time === "string" && /^\d{2}:\d{2}$/.test(schedule.time) ? schedule.time : DEFAULT_SMM_STRATEGY.time,
  };
}

async function ownedProjectId(userId: string, projectId: string) {
  const project = await getOwnedProject(userId, String(projectId));
  return project ? project.id : null;
}

const NO_PROJECT = { ok: false as const, error: "Проект не найден." };

export async function getSmmStrategy(projectId: string): Promise<SmmActionResult<{ strategy: SmmStrategyState }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await ownedProjectId(userId, projectId);
    if (!project) return NO_PROJECT;
    const { data, error } = await createSupabaseAdminClient()
      .from("smm_strategy")
      .select("project_description, tone_of_voice, posting_schedule")
      .eq("project_id", project)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, strategy: readStrategy(data) };
  } catch (error) {
    return failure(error);
  }
}

export async function saveSmmStrategy(projectId: string, input: SmmStrategyState): Promise<SmmActionResult<{ strategy: SmmStrategyState }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await ownedProjectId(userId, projectId);
    if (!project) return NO_PROJECT;
    const description = String(input?.description ?? "").trim();
    if (description.length > MAX_DESCRIPTION) {
      return { ok: false, error: `Описание слишком длинное: максимум ${MAX_DESCRIPTION} символов.` };
    }
    if (!SMM_TONES.includes(input?.tone as never)) return { ok: false, error: "Выберите Tone of Voice." };
    const days = SMM_DAYS.filter((day) => Array.isArray(input?.days) && input.days.includes(day));
    if (days.length === 0) return { ok: false, error: "Выберите хотя бы один день публикации." };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input?.time ?? ""))) return { ok: false, error: "Укажите время в формате ЧЧ:ММ." };

    const { error } = await createSupabaseAdminClient()
      .from("smm_strategy")
      .upsert(
        {
          user_id: userId,
          project_id: project,
          project_description: description,
          tone_of_voice: input.tone,
          posting_schedule: { days, time: input.time, posts_per_week: days.length },
        },
        { onConflict: "project_id" },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true, strategy: { description, tone: input.tone, days: [...days], time: input.time } };
  } catch (error) {
    return failure(error);
  }
}

export async function getSmmStudio(projectId: string): Promise<SmmActionResult<{ studio: SmmStudioState }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await ownedProjectId(userId, projectId);
    if (!project) return NO_PROJECT;
    const supabase = createSupabaseAdminClient();
    const [integrations, profile] = await Promise.all([
      supabase.from("smm_integrations").select("default_avatar_id").eq("project_id", project).eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("video_credits").eq("id", userId).maybeSingle(),
    ]);
    if (integrations.error) return { ok: false, error: integrations.error.message };
    if (profile.error) return { ok: false, error: profile.error.message };
    return {
      ok: true,
      studio: {
        avatarId: typeof integrations.data?.default_avatar_id === "string" ? integrations.data.default_avatar_id : "",
        credits: Math.max(0, Number(profile.data?.video_credits ?? 0)),
      },
    };
  } catch (error) {
    return failure(error);
  }
}

export async function saveSmmAvatarId(projectId: string, value: string): Promise<SmmActionResult<{ avatarId: string }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await ownedProjectId(userId, projectId);
    if (!project) return NO_PROJECT;
    const avatarId = String(value ?? "").trim();
    if (avatarId.length > 200) return { ok: false, error: "ID аватара слишком длинный." };
    const { error } = await createSupabaseAdminClient()
      .from("smm_integrations")
      .upsert({ user_id: userId, project_id: project, default_avatar_id: avatarId || null }, { onConflict: "project_id" });
    if (error) return { ok: false, error: error.message };
    return { ok: true, avatarId };
  } catch (error) {
    return failure(error);
  }
}
export async function getSmmPosts(projectId: string): Promise<SmmActionResult<{ posts: SmmPostItem[] }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await ownedProjectId(userId, projectId);
    if (!project) return NO_PROJECT;
    const { data, error } = await createSupabaseAdminClient()
      .from("smm_posts")
      .select("id, content_text, media_urls, scheduled_time, status, created_at")
      .eq("project_id", project)
      .eq("user_id", userId)
      .order("scheduled_time", { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      posts: (data ?? []).map((row) => ({
        id: String(row.id),
        text: String(row.content_text ?? ""),
        status: String(row.status) as SmmPostItem["status"],
        scheduledTime: (row.scheduled_time as string | null) ?? null,
        hasMedia: Array.isArray(row.media_urls) && row.media_urls.length > 0,
      })),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось загрузить посты." };
  }
}