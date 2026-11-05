"use server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getOpenAI } from "@/lib/openai";
import { getOwnedProject } from "@/lib/smm-projects";
import {
  SMM_CHANNELS,
  SMM_IDEA_STATUSES,
  SMM_PERIODS,
  SMM_VIDEO_FORMATS,
  type SmmChannelId,
  type SmmIdea,
  type SmmIdeaEdit,
  type SmmIdeaStatus,
  type SmmPeriod,
  type SmmVideoFormat,
} from "@/lib/smm-strategy-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Failure = { ok: false; error: string };

const COLUMNS = "id, title, content, status, video_format, voiceover_text, visual_prompt, scheduled_time, target_channels";
const MIGRATION_HINT = "Примените миграцию 20261106_smm_ideas_and_posts.sql в Supabase.";
const NO_POST: Failure = { ok: false, error: "Пост не найден." };

function fail(error: unknown): Failure {
  return { ok: false, error: error instanceof Error ? error.message : "Не удалось выполнить действие." };
}

function dbError(message: string): Failure {
  return { ok: false, error: /video_format|voiceover_text|target_channels|visual_prompt|title/.test(message) ? MIGRATION_HINT : message };
}

function toIdea(row: Record<string, unknown>): SmmIdea {
  const format = String(row.video_format);
  const channels = Array.isArray(row.target_channels) ? (row.target_channels as string[]) : [];
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    status: (SMM_IDEA_STATUSES as readonly string[]).includes(String(row.status)) ? (row.status as SmmIdeaStatus) : "idea",
    videoFormat: (SMM_VIDEO_FORMATS as readonly string[]).includes(format) ? (format as SmmVideoFormat) : "none",
    voiceoverText: String(row.voiceover_text ?? ""),
    visualPrompt: String(row.visual_prompt ?? ""),
    scheduledTime: (row.scheduled_time as string | null) ?? null,
    channels: channels.filter((item): item is SmmChannelId => SMM_CHANNELS.some((channel) => channel.id === item)),
  };
}

/** Пост пользователя (id + project_id) или null: чужие посты неотличимы от несуществующих. */
async function ownedPost(userId: string, postId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(String(postId))) return null;
  const { data } = await createSupabaseAdminClient()
    .from("smm_posts")
    .select("id, project_id")
    .eq("id", postId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? { id: String(data.id), projectId: String(data.project_id) } : null;
}

export async function getProjectIdeas(projectId: string): Promise<{ ok: true; ideas: SmmIdea[] } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await getOwnedProject(userId, String(projectId));
    if (!project) return { ok: false, error: "Проект не найден." };
    const { data, error } = await createSupabaseAdminClient()
      .from("smm_posts")
      .select(COLUMNS)
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .in("status", ["idea", "in_progress", "ready"])
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) return dbError(error.message);
    return { ok: true, ideas: (data ?? []).map((row) => toIdea(row as Record<string, unknown>)) };
  } catch (error) {
    return fail(error);
  }
}

type RawIdea = { title?: unknown; content?: unknown; video_format?: unknown; voiceover_text?: unknown; visual_prompt?: unknown };

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function generateStrategyAction(params: {
  projectId: string;
  period: SmmPeriod;
  videoRatio: number;
  topic?: string;
}): Promise<{ ok: true; ideas: SmmIdea[] } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await getOwnedProject(userId, String(params?.projectId));
    if (!project) return { ok: false, error: "Проект не найден." };

    const period = params.period in SMM_PERIODS ? params.period : null;
    if (!period) return { ok: false, error: "Выберите период." };
    const count = SMM_PERIODS[period].count;
    const ratio = Math.min(100, Math.max(0, Math.round(Number(params.videoRatio) || 0)));
    const videoCount = Math.round((count * ratio) / 100);
    const topic = text(params.topic, 300);

    const supabase = createSupabaseAdminClient();
    const { data: brand, error: brandError } = await supabase
      .from("smm_projects")
      .select("name, tone_of_voice, target_audience")
      .eq("id", project.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (brandError) return dbError(brandError.message);
    const tone = text(brand?.tone_of_voice, 2000) || "дружелюбный, понятный, экспертный";
    const audience = text(brand?.target_audience, 2000) || "широкая аудитория, интересующаяся продуктом или услугой бренда";

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.9,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Ты — senior SMM-стратег и сценарист коротких вертикальных видео (Reels, TikTok, Shorts).",
            `Бренд: «${project.name}».`,
            `Tone of Voice бренда: ${tone}.`,
            `Целевая аудитория: ${audience}.`,
            "Придумай разные, не повторяющиеся идеи постов с цепляющим хуком. Пиши на русском.",
            "Верни СТРОГО JSON-объект вида {\"posts\": [ ... ]} без пояснений и markdown. Каждый элемент массива:",
            '{"title": "Хук/заголовок", "content": "Текст поста с абзацами и хэштегами", "video_format": "avatar" | "broll" | "overlay" | "none", "voiceover_text": "Текст озвучки на 15-30 секунд", "visual_prompt": "Описание кадра/видеоряда"}',
            "avatar — говорящая голова ведущего; broll — видеоряд с озвучкой за кадром; overlay — динамичные титры/текст на экране; none — только текстовый пост.",
            "Для формата none поля voiceover_text и visual_prompt оставь пустыми строками.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Сгенерируй ровно ${count} постов.`,
            `Из них ровно ${videoCount} должны быть видео (video_format: avatar, broll или overlay, чередуй), остальные ${count - videoCount} — текстовые (video_format: none).`,
            topic ? `Тема/повод: ${topic}.` : "Тема свободная: подбери актуальные для бренда и аудитории.",
          ].join("\n"),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "Модель вернула некорректный ответ. Попробуйте ещё раз." };
    }
    const list = Array.isArray(parsed) ? parsed : ((parsed as { posts?: unknown })?.posts ?? []);
    if (!Array.isArray(list) || list.length === 0) return { ok: false, error: "Модель не вернула идей. Попробуйте ещё раз." };

    let videosLeft = videoCount;
    const rows = (list as RawIdea[])
      .slice(0, count)
      .map((item) => {
        const title = text(item.title, 200);
        const content = text(item.content, 4000);
        let format = (SMM_VIDEO_FORMATS as readonly string[]).includes(String(item.video_format)) ? (item.video_format as SmmVideoFormat) : "none";
        // Доля видео задаёт пользователь: лишние видео превращаем в текст, нехватку добираем b-roll.
        if (format !== "none" && videosLeft <= 0) format = "none";
        else if (format !== "none") videosLeft -= 1;
        return { title, content, format, voiceover: text(item.voiceover_text, 2000), visual: text(item.visual_prompt, 2000) };
      })
      .filter((item) => item.title || item.content)
      .map((item) => {
        if (item.format === "none" && videosLeft > 0 && item.voiceover) {
          videosLeft -= 1;
          return { ...item, format: "broll" as SmmVideoFormat };
        }
        return item;
      })
      .map((item) => ({
        user_id: userId,
        project_id: project.id,
        title: item.title || item.content.slice(0, 80),
        content: item.content,
        content_text: item.content,
        status: "idea",
        video_format: item.format,
        voiceover_text: item.format === "none" ? null : item.voiceover || null,
        visual_prompt: item.format === "none" ? null : item.visual || null,
      }));
    if (rows.length === 0) return { ok: false, error: "Модель вернула пустые идеи. Попробуйте ещё раз." };

    const { data, error } = await supabase.from("smm_posts").insert(rows).select(COLUMNS);
    if (error) return dbError(error.message);
    return { ok: true, ideas: (data ?? []).map((row) => toIdea(row as Record<string, unknown>)) };
  } catch (error) {
    return fail(error);
  }
}

export async function updatePostStatus(postId: string, newStatus: SmmIdeaStatus): Promise<{ ok: true } | Failure> {
  try {
    if (!(SMM_IDEA_STATUSES as readonly string[]).includes(String(newStatus))) return { ok: false, error: "Недопустимый статус." };
    const userId = await getAuthenticatedUserId();
    const post = await ownedPost(userId, postId);
    if (!post) return NO_POST;
    const { error } = await createSupabaseAdminClient().from("smm_posts").update({ status: newStatus }).eq("id", post.id).eq("user_id", userId);
    return error ? dbError(error.message) : { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function updatePostContent(postId: string, data: SmmIdeaEdit): Promise<{ ok: true; idea: SmmIdea } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const post = await ownedPost(userId, postId);
    if (!post) return NO_POST;
    const title = text(data?.title, 200);
    const content = text(data?.content, 4000);
    if (!title) return { ok: false, error: "Заголовок не может быть пустым." };
    const format = (SMM_VIDEO_FORMATS as readonly string[]).includes(String(data?.videoFormat)) ? data.videoFormat : "none";
    const none = format === "none";
    const { data: row, error } = await createSupabaseAdminClient()
      .from("smm_posts")
      .update({
        title,
        content,
        content_text: content,
        video_format: format,
        voiceover_text: none ? null : text(data.voiceoverText, 2000) || null,
        visual_prompt: none ? null : text(data.visualPrompt, 2000) || null,
      })
      .eq("id", post.id)
      .eq("user_id", userId)
      .select(COLUMNS)
      .single();
    if (error || !row) return dbError(error?.message ?? "Не удалось сохранить.");
    return { ok: true, idea: toIdea(row as Record<string, unknown>) };
  } catch (error) {
    return fail(error);
  }
}

export async function deletePost(postId: string): Promise<{ ok: true } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const post = await ownedPost(userId, postId);
    if (!post) return NO_POST;
    const { error } = await createSupabaseAdminClient().from("smm_posts").delete().eq("id", post.id).eq("user_id", userId);
    return error ? dbError(error.message) : { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function schedulePost(postId: string, scheduledTime: string, channels: string[]): Promise<{ ok: true; idea: SmmIdea } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const post = await ownedPost(userId, postId);
    if (!post) return NO_POST;
    const date = new Date(String(scheduledTime));
    if (Number.isNaN(date.getTime())) return { ok: false, error: "Укажите корректные дату и время." };
    const allowed = new Set<string>(SMM_CHANNELS.map((channel) => channel.id));
    const picked = [...new Set((Array.isArray(channels) ? channels : []).map(String))].filter((id) => allowed.has(id));
    if (picked.length === 0) return { ok: false, error: "Выберите хотя бы одну соцсеть." };
    const { data: row, error } = await createSupabaseAdminClient()
      .from("smm_posts")
      .update({ scheduled_time: date.toISOString(), target_channels: picked, status: "ready" })
      .eq("id", post.id)
      .eq("user_id", userId)
      .select(COLUMNS)
      .single();
    if (error || !row) return dbError(error?.message ?? "Не удалось сохранить.");
    return { ok: true, idea: toIdea(row as Record<string, unknown>) };
  } catch (error) {
    return fail(error);
  }
}

/** Пост для автозаполнения сценария в AI-Видеостудии (?postId=). */
export async function getPostForStudio(projectId: string, postId: string): Promise<{ title: string; script: string } | null> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await getOwnedProject(userId, String(projectId));
    if (!project || !/^[0-9a-f-]{36}$/i.test(String(postId))) return null;
    const { data } = await createSupabaseAdminClient()
      .from("smm_posts")
      .select("title, content, voiceover_text")
      .eq("id", postId)
      .eq("project_id", project.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    return { title: String(data.title ?? ""), script: String(data.voiceover_text || data.content || "") };
  } catch {
    return null;
  }
}
