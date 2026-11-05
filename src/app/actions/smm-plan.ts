"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getOwnedProject } from "@/lib/smm-projects";
import { SMM_CHANNELS, SMM_VIDEO_FORMATS, type SmmChannelId, type SmmPlanItem, type SmmVideoFormat } from "@/lib/smm-strategy-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Failure = { ok: false; error: string };

function fail(error: unknown): Failure {
  return { ok: false, error: error instanceof Error ? error.message : "Не удалось выполнить действие." };
}

/** Пост пользователя с проверкой владельца: чужие неотличимы от несуществующих. */
async function ownedPost(userId: string, postId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(String(postId))) return null;
  const { data } = await createSupabaseAdminClient()
    .from("smm_posts")
    .select("id, project_id, status")
    .eq("id", postId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? { id: String(data.id), projectId: String(data.project_id), status: String(data.status) } : null;
}

export async function getScheduledPosts(projectId: string): Promise<{ ok: true; posts: SmmPlanItem[] } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await getOwnedProject(userId, String(projectId));
    if (!project) return { ok: false, error: "Проект не найден." };
    const { data, error } = await createSupabaseAdminClient()
      .from("smm_posts")
      .select("id, title, content, status, scheduled_time, target_channels, video_format, media_urls")
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .in("status", ["ready", "published"])
      .order("scheduled_time", { ascending: true, nullsFirst: false })
      .limit(500);
    if (error) return { ok: false, error: error.message };
    return {
      ok: true,
      posts: (data ?? []).map((row) => {
        const channels = Array.isArray(row.target_channels) ? (row.target_channels as string[]) : [];
        const format = String(row.video_format);
        const media = Array.isArray(row.media_urls) ? (row.media_urls as unknown[]).find((item) => typeof item === "string") : null;
        return {
          id: String(row.id),
          title: String(row.title ?? ""),
          content: String(row.content ?? ""),
          status: row.status === "published" ? "published" : "ready",
          scheduledTime: (row.scheduled_time as string | null) ?? null,
          channels: channels.filter((item): item is SmmChannelId => SMM_CHANNELS.some((channel) => channel.id === item)),
          videoFormat: (SMM_VIDEO_FORMATS as readonly string[]).includes(format) ? (format as SmmVideoFormat) : "none",
          mediaUrl: typeof media === "string" ? media : null,
        } satisfies SmmPlanItem;
      }),
    };
  } catch (error) {
    return fail(error);
  }
}

/** Снимает пост с публикации: чистит время и каналы, возвращает пост на доску в «В работе». */
export async function cancelScheduledPost(postId: string): Promise<{ ok: true } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const post = await ownedPost(userId, postId);
    if (!post) return { ok: false, error: "Пост не найден." };
    if (post.status !== "ready") return { ok: false, error: "Опубликованный пост нельзя снять с публикации." };
    const { error } = await createSupabaseAdminClient()
      .from("smm_posts")
      .update({ scheduled_time: null, target_channels: [], status: "in_progress" })
      .eq("id", post.id)
      .eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/smm/p/${post.projectId}/plan`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function reschedulePost(postId: string, newTime: string): Promise<{ ok: true; scheduledTime: string } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const post = await ownedPost(userId, postId);
    if (!post) return { ok: false, error: "Пост не найден." };
    if (post.status !== "ready") return { ok: false, error: "Опубликованный пост нельзя перенести." };
    const date = new Date(String(newTime));
    if (Number.isNaN(date.getTime())) return { ok: false, error: "Укажите корректные дату и время." };
    const iso = date.toISOString();
    const { error } = await createSupabaseAdminClient().from("smm_posts").update({ scheduled_time: iso }).eq("id", post.id).eq("user_id", userId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/smm/p/${post.projectId}/plan`);
    return { ok: true, scheduledTime: iso };
  } catch (error) {
    return fail(error);
  }
}
