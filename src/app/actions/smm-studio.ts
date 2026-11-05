"use server";

import { randomUUID } from "node:crypto";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { generateImage } from "@/lib/generate-creatives";
import { isRateLimited } from "@/lib/demo-rate-limit";
import { getOwnedProject } from "@/lib/smm-projects";
import { STUDIO_MAX_UPLOAD_BYTES, STUDIO_UPLOAD_EXTENSIONS } from "@/lib/smm-studio-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const BUCKET = "smm_media";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const DRAFT_TEXT_MAX = 600;
const DRAFT_LIMIT_PER_WINDOW = 12;

type Failure = { ok: false; error: string };

function fail(error: unknown): Failure {
  return { ok: false, error: error instanceof Error ? error.message : "Не удалось выполнить действие." };
}

function bucketHint(message: string) {
  return /bucket|smm_assets|not found/i.test(message) ? "Примените миграцию 20261106_smm_studio_assets.sql в Supabase." : message;
}

/** Шаг 1 загрузки: выдаёт одноразовую подпись для прямой загрузки файла в бакет (минуя лимит тела запроса). */
export async function createStudioUploadUrl(
  projectId: string,
  fileName: string,
  size: number,
): Promise<{ ok: true; path: string; token: string } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await getOwnedProject(userId, String(projectId));
    if (!project) return { ok: false, error: "Проект не найден." };

    const extension = String(fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
    if (!(STUDIO_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) return { ok: false, error: "Допустимы только файлы .mp4 и .mov." };
    if (!Number.isFinite(size) || size <= 0 || size > STUDIO_MAX_UPLOAD_BYTES) return { ok: false, error: "Размер файла не должен превышать 50 МБ." };

    const path = `${project.id}/uploads/${randomUUID()}.${extension}`;
    const { data, error } = await createSupabaseAdminClient().storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: bucketHint(error?.message ?? "Не удалось подготовить загрузку.") };
    return { ok: true, path, token: data.token };
  } catch (error) {
    return fail(error);
  }
}

/** Шаг 2: после загрузки проверяет, что файл существует в папке проекта, и записывает его в smm_assets. */
export async function registerStudioUpload(projectId: string, path: string): Promise<{ ok: true; url: string; assetId: string } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await getOwnedProject(userId, String(projectId));
    if (!project) return { ok: false, error: "Проект не найден." };
    const clean = String(path ?? "");
    if (!clean.startsWith(`${project.id}/uploads/`) || clean.includes("..")) return { ok: false, error: "Некорректный путь файла." };

    const supabase = createSupabaseAdminClient();
    const folder = `${project.id}/uploads`;
    const name = clean.slice(folder.length + 1);
    const { data: listed } = await supabase.storage.from(BUCKET).list(folder, { search: name, limit: 1 });
    if (!listed?.some((item) => item.name === name)) return { ok: false, error: "Файл не найден в хранилище. Повторите загрузку." };

    const url = supabase.storage.from(BUCKET).getPublicUrl(clean).data.publicUrl;
    const { data, error } = await supabase
      .from("smm_assets")
      .insert({ project_id: project.id, file_url: url, storage_path: clean, asset_type: "user_upload" })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: bucketHint(error?.message ?? "Не удалось сохранить файл.") };
    return { ok: true, url, assetId: String(data.id) };
  } catch (error) {
    return fail(error);
  }
}

/** Бесплатный черновик: озвучка ElevenLabs и статичный кадр AI-фона. Кредиты не списываются. */
export async function generateStudioDraft(input: {
  projectId: string;
  voiceoverText: string;
  visualPrompt: string;
  useAiBackground: boolean;
}): Promise<{ ok: true; audioUrl: string | null; imageUrl: string | null } | Failure> {
  try {
    const userId = await getAuthenticatedUserId();
    const project = await getOwnedProject(userId, String(input?.projectId));
    if (!project) return { ok: false, error: "Проект не найден." };

    const voiceover = String(input.voiceoverText ?? "").trim().slice(0, DRAFT_TEXT_MAX);
    const prompt = String(input.visualPrompt ?? "").trim().slice(0, 1000);
    const wantImage = Boolean(input.useAiBackground) && prompt.length > 0;
    if (!voiceover && !wantImage) return { ok: false, error: "Заполните текст озвучки или промпт для AI-фона." };
    if (isRateLimited("studio-draft", userId, DRAFT_LIMIT_PER_WINDOW)) return { ok: false, error: "Слишком много черновиков. Подождите несколько минут." };

    const supabase = createSupabaseAdminClient();
    const apiKey = (process.env.MASTER_ELEVENLABS_KEY || process.env.ELEVENLABS_API_KEY || "").trim();

    const audioTask = async (): Promise<string | null> => {
      if (!voiceover) return null;
      if (!apiKey) throw new Error("Озвучка недоступна: не настроен ключ ElevenLabs.");
      const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_VOICE_ID;
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: voiceover, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.55, similarity_boost: 0.85 } }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!response.ok) throw new Error("Не удалось озвучить текст. Попробуйте позже.");
      const path = `${project.id}/drafts/${randomUUID()}.mp3`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, await response.arrayBuffer(), { contentType: "audio/mpeg" });
      if (error) throw new Error(bucketHint(error.message));
      return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    };

    const imageTask = async (): Promise<string | null> => {
      if (!wantImage) return null;
      const url = await generateImage(prompt, "9:16");
      if (/placehold\.co/i.test(url)) throw new Error("Не удалось сгенерировать изображение. Попробуйте ещё раз.");
      await supabase.from("smm_assets").insert({ project_id: project.id, file_url: url, asset_type: "ai_generated" });
      return url;
    };

    const [audio, image] = await Promise.allSettled([audioTask(), imageTask()]);
    if (audio.status === "rejected" && image.status === "rejected") return fail(audio.reason);
    return {
      ok: true,
      audioUrl: audio.status === "fulfilled" ? audio.value : null,
      imageUrl: image.status === "fulfilled" ? image.value : null,
    };
  } catch (error) {
    return fail(error);
  }
}
