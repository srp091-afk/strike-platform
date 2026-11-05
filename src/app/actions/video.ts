"use server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { VIDEO_JOB_ID_PATTERN, type VideoMode, type VideoStatus } from "@/lib/video-types";

/*
 * Ключи нейросетей пользователя читаются из smm_integrations на сервере и уходят только в видеодвижок.
 * В браузер возвращаются лишь job_id и статус, VIDEO_ENGINE_API_KEY тоже остаётся на сервере.
 */

type StartResult = { ok: true; jobId: string } | { ok: false; error: string };
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

export async function startVideoGeneration(text: string, mode: string, videoPrompt?: string): Promise<StartResult> {
  try {
    const userId = await getAuthenticatedUserId();
    const config = engineConfig();
    if (!config) return { ok: false, error: "Видеодвижок не настроен: добавьте VIDEO_ENGINE_URL и VIDEO_ENGINE_API_KEY." };

    const script = String(text ?? "").trim();
    if (!script) return { ok: false, error: "Введите сценарий ролика." };
    if (script.length > MAX_TEXT) return { ok: false, error: `Сценарий слишком длинный: максимум ${MAX_TEXT} символов.` };
    if (mode !== "avatar" && mode !== "broll") return { ok: false, error: "Выберите режим: аватар или B-Roll." };
    const videoMode: VideoMode = mode;

    const { data, error } = await createSupabaseAdminClient()
      .from("smm_integrations")
      .select("heygen_api_key, runway_api_key, elevenlabs_api_key, default_avatar_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };

    const heygen = data?.heygen_api_key as string | null | undefined;
    const runway = data?.runway_api_key as string | null | undefined;
    const elevenlabs = data?.elevenlabs_api_key as string | null | undefined;
    const avatarId = (data?.default_avatar_id as string | null | undefined) ?? null;

    if (!elevenlabs) return { ok: false, error: "Добавьте ключ ElevenLabs во вкладке «AI-Студия»." };
    if (videoMode === "avatar") {
      if (!heygen) return { ok: false, error: "Добавьте ключ HeyGen во вкладке «AI-Студия»." };
      if (!avatarId) return { ok: false, error: "Укажите ID аватара по умолчанию во вкладке «AI-Студия»." };
    } else if (!runway) {
      return { ok: false, error: "Добавьте ключ RunwayML во вкладке «AI-Студия»." };
    }

    const response = await fetch(`${config.url}/api/v1/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({
        mode: videoMode,
        text: script,
        video_prompt: videoMode === "broll" && videoPrompt?.trim() ? videoPrompt.trim().slice(0, 1000) : undefined,
        avatar_id: videoMode === "avatar" ? avatarId : undefined,
        credentials: {
          heygen_api_key: heygen ?? undefined,
          runway_api_key: runway ?? undefined,
          elevenlabs_api_key: elevenlabs,
          // Движку нужен OpenAI (транскрибация субтитров): используем ключ платформы.
          openai_api_key: process.env.OPENAI_API_KEY || undefined,
        },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(START_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, error: await engineError(response) };

    const body = (await response.json()) as { job_id?: unknown };
    if (typeof body.job_id !== "string" || !VIDEO_JOB_ID_PATTERN.test(body.job_id)) {
      return { ok: false, error: "Видеодвижок вернул некорректный job_id." };
    }
    return { ok: true, jobId: body.job_id };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.message.includes("Нужно войти") ? error.message : unreachable(error) };
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
