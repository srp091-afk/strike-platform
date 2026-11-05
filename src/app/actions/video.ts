"use server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getOwnedProject } from "@/lib/smm-projects";
import { STUDIO_STYLES, type StudioRenderOptions } from "@/lib/smm-studio-types";
import { getSupabaseUrl } from "@/lib/supabase";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { VIDEO_JOB_ID_PATTERN, type VideoMode, type VideoStatus } from "@/lib/video-types";

/*
 * Внутренняя экономика: платформа использует мастер-ключи из env (MASTER_*), пользователь тратит
 * кредиты profiles.video_credits. Ключи и токен движка остаются на сервере: в браузер уходят
 * только job_id, статус и остаток кредитов.
 */

type StartResult = { ok: true; jobId: string; credits: number } | { ok: false; error: string };
type StatusResult = { ok: true; status: VideoStatus } | { ok: false; error: string };

const MAX_TEXT = 4000;
const START_TIMEOUT_MS = 20_000;
const STATUS_TIMEOUT_MS = 10_000;

function engineConfig() {
  const url = process.env.VIDEO_ENGINE_URL?.trim().replace(/\/$/, "");
  const key = process.env.VIDEO_ENGINE_API_KEY?.trim();
  if (!url || !key) return null;
  return { url, key };
}

async function engineError(response: Response) {
  try {
    const body = (await response.json()) as { detail?: unknown; error_message?: unknown };
    const detail = body.detail ?? body.error_message;
    if (typeof detail === "string" && detail) return detail;
    if (Array.isArray(detail)) return "Видеодвижок отклонил запрос: проверьте текст сценария.";
  } catch {
    // тело не JSON
  }
  return `Видеодвижок вернул ошибку ${response.status}.`;
}

function unreachable(error: unknown) {
  const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
  return timeout ? "Видеодвижок не отвечает: превышено время ожидания." : "Видеодвижок недоступен. Проверьте, что он запущен и VIDEO_ENGINE_URL указан верно.";
}

export async function startVideoGeneration(
  projectId: string,
  text: string,
  mode: string,
  videoPrompt?: string,
  options?: StudioRenderOptions,
): Promise<StartResult> {
  let userId: string;
  try {
    userId = await getAuthenticatedUserId();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Нужно войти в аккаунт." };
  }

  const project = await getOwnedProject(userId, String(projectId)).catch(() => null);
  if (!project) return { ok: false, error: "Проект не найден." };

  const config = engineConfig();
  if (!config) return { ok: false, error: "Видеодвижок не настроен: добавьте VIDEO_ENGINE_URL и VIDEO_ENGINE_API_KEY." };

  const script = String(text ?? "").trim();
  if (!script) return { ok: false, error: "Введите сценарий ролика." };
  if (script.length > MAX_TEXT) return { ok: false, error: `Сценарий слишком длинный: максимум ${MAX_TEXT} символов.` };
  if (mode !== "avatar" && mode !== "broll") return { ok: false, error: "Выберите режим: аватар или B-Roll." };
  const videoMode: VideoMode = mode;

  // Параметры студии: стиль, загруженный фон (только из папки этого проекта в нашем бакете), плашка и пост.
  const style = options && (STUDIO_STYLES as readonly string[]).includes(options.style) ? options.style : null;
  const overlayText = String(options?.overlayText ?? "").trim().slice(0, 300);
  let backgroundUrl: string | null = null;
  if (options?.backgroundUrl) {
    const allowedPrefix = `${getSupabaseUrl()}/storage/v1/object/public/smm_media/${project.id}/`;
    const candidate = String(options.backgroundUrl);
    if (!candidate.startsWith(allowedPrefix) || candidate.includes("..") || candidate.length > 500) {
      return { ok: false, error: "Недопустимый адрес фонового видео." };
    }
    if (videoMode !== "broll") return { ok: false, error: "Свой фон можно использовать только в форматах «Титры» и «Оверлей»." };
    backgroundUrl = candidate;
  }

  // Мастер-ключи платформы (не пользовательские).
  const elevenlabs = process.env.MASTER_ELEVENLABS_KEY?.trim();
  const runway = process.env.MASTER_RUNWAY_KEY?.trim();
  const heygen = process.env.MASTER_HEYGEN_KEY?.trim();
  const missing =
    !elevenlabs || (videoMode === "avatar" && !heygen) || (videoMode === "broll" && !runway && !backgroundUrl);
  if (missing) return { ok: false, error: "Генерация видео временно недоступна: на платформе не настроены ключи сервиса." };

  const supabase = createSupabaseAdminClient();
  const { data: integration } = await supabase.from("smm_integrations").select("default_avatar_id").eq("project_id", project.id).eq("user_id", userId).maybeSingle();
  const avatarId = (integration?.default_avatar_id as string | null | undefined) ?? null;

  // Атомарное списание 1 кредита (-1 = кредитов нет). Гонка двух запусков невозможна: это один UPDATE в БД.
  const spent = await supabase.rpc("consume_video_credit", { p_user_id: userId });
  if (spent.error) return { ok: false, error: spent.error.message };
  const remaining = Number(spent.data ?? -1);
  if (remaining < 0) return { ok: false, error: "Недостаточно кредитов. Пополните баланс." };

  const refund = async () => {
    await supabase.rpc("refund_video_credit", { p_user_id: userId });
  };

  try {
    const response = await fetch(`${config.url}/api/v1/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({
        mode: videoMode,
        text: script,
        video_prompt: videoMode === "broll" && videoPrompt?.trim() ? videoPrompt.trim().slice(0, 1000) : undefined,
        avatar_id: videoMode === "avatar" && avatarId ? avatarId : undefined,
        style: style ?? undefined,
        background_url: backgroundUrl ?? undefined,
        overlay_text: overlayText || undefined,
        credentials: {
          heygen_api_key: videoMode === "avatar" ? heygen : undefined,
          runway_api_key: videoMode === "broll" ? runway : undefined,
          elevenlabs_api_key: elevenlabs,
          // Движку нужен OpenAI (транскрибация субтитров): ключ платформы.
          openai_api_key: process.env.OPENAI_API_KEY || undefined,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(START_TIMEOUT_MS),
    });
    if (!response.ok) {
      await refund();
      return { ok: false, error: await engineError(response) };
    }

    const body = (await response.json()) as { job_id?: unknown };
    if (typeof body.job_id !== "string" || !VIDEO_JOB_ID_PATTERN.test(body.job_id)) {
      await refund();
      return { ok: false, error: "Видеодвижок вернул некорректный job_id." };
    }
    // Привязанный пост уходит в работу (только свой пост этого проекта).
    if (options?.postId && /^[0-9a-f-]{36}$/i.test(String(options.postId))) {
      await supabase
        .from("smm_posts")
        .update({ status: "in_progress" })
        .eq("id", options.postId)
        .eq("project_id", project.id)
        .eq("user_id", userId)
        .in("status", ["idea", "in_progress"]);
    }
    return { ok: true, jobId: body.job_id, credits: remaining };
  } catch (error) {
    await refund();
    return { ok: false, error: unreachable(error) };
  }
}
export async function checkVideoStatus(jobId: string): Promise<StatusResult> {
  try {
    await getAuthenticatedUserId();
    const config = engineConfig();
    if (!config) return { ok: false, error: "Видеодвижок не настроен." };
    if (!VIDEO_JOB_ID_PATTERN.test(String(jobId))) return { ok: false, error: "Некорректный идентификатор задачи." };

    const response = await fetch(`${config.url}/api/v1/render/${jobId}`, {
      headers: { Authorization: `Bearer ${config.key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, error: await engineError(response) };

    const body = (await response.json()) as { status?: unknown; stage?: unknown; error_message?: unknown; downloaded?: unknown };
    const status = body.status === "completed" || body.status === "failed" ? body.status : "processing";
    return {
      ok: true,
      status: {
        jobId,
        status,
        stage: typeof body.stage === "string" ? body.stage : "queued",
        errorMessage: typeof body.error_message === "string" ? body.error_message : null,
        downloaded: body.downloaded === true,
      },
    };
  } catch (error) {
    return { ok: false, error: unreachable(error) };
  }
}
