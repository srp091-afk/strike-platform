import { findAvatar } from "@/lib/sites/ai-avatars";
import type { VoiceLocale, VoiceStyle } from "@/lib/sites/quiz-schema";

export type AvatarVideoRequest = {
  siteId: string;
  stepId: string;
  avatarId: string;
  script: string;
  voiceStyle: VoiceStyle;
  locale: VoiceLocale;
};

export type AvatarVideoResult = {
  status: "queued" | "ready" | "provider_pending";
  videoUrl: string | null;
  jobId: string | null;
  message?: string;
  fallbackMode?: "text";
};

const PENDING = "Скрипт и аватар сохранены. Автоматический рендер видео включится сразу после подключения видео-движка.";

export async function requestAvatarVideo(input: AvatarVideoRequest): Promise<AvatarVideoResult> {
  const genericUrl = process.env.AVATAR_VIDEO_API_URL?.trim();
  const genericKey = process.env.AVATAR_VIDEO_API_KEY?.trim();
  const heygenKey = process.env.HEYGEN_API_KEY?.trim();
  if (!genericUrl && !heygenKey) {
    return { status: "provider_pending", videoUrl: null, jobId: null, message: PENDING, fallbackMode: "text" };
  }
  try {
    if (genericUrl && genericKey) return await postGeneric(genericUrl, genericKey, input);
    if (heygenKey) return await postHeygen(heygenKey, input);
    return { status: "provider_pending", videoUrl: null, jobId: null, message: PENDING, fallbackMode: "text" };
  } catch (error) {
    const message = error instanceof Error ? error.message : PENDING;
    return { status: "provider_pending", videoUrl: null, jobId: null, message, fallbackMode: "text" };
  }
}

async function postGeneric(url: string, key: string, input: AvatarVideoRequest): Promise<AvatarVideoResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json().catch(() => ({}))) as { status?: string; videoUrl?: string; jobId?: string; message?: string };
  if (!response.ok) return { status: "provider_pending", videoUrl: null, jobId: null, message: payload.message || PENDING, fallbackMode: "text" };
  const ready = payload.status === "ready" && payload.videoUrl;
  return {
    status: ready ? "ready" : "queued",
    videoUrl: payload.videoUrl || null,
    jobId: payload.jobId || null,
    message: payload.message,
  };
}

async function postHeygen(key: string, input: AvatarVideoRequest): Promise<AvatarVideoResult> {
  const avatarId = heygenAvatarId(input.avatarId);
  if (!avatarId) {
    return { status: "provider_pending", videoUrl: null, jobId: null, message: "Скрипт сохранён. Для рендера укажите HEYGEN_AVATAR_IDS с id этого аватара.", fallbackMode: "text" };
  }
  const response = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: { "X-Api-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      video_inputs: [{
        character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
        voice: { type: "text", input_text: input.script.slice(0, 500), speed: input.voiceStyle === "calm" ? 0.9 : input.voiceStyle === "friendly" ? 1.05 : 1 },
      }],
      dimension: { width: 720, height: 1280 },
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as { data?: { video_id?: string }; error?: { message?: string } };
  if (!response.ok || !payload.data?.video_id) {
    return { status: "provider_pending", videoUrl: null, jobId: null, message: payload.error?.message || PENDING, fallbackMode: "text" };
  }
  return { status: "queued", videoUrl: null, jobId: payload.data.video_id, message: "Видео поставлено в очередь." };
}

function heygenAvatarId(presetId: string) {
  const raw = process.env.HEYGEN_AVATAR_IDS?.trim();
  if (!raw) return "";
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[presetId] || map[findAvatar(presetId)?.id || ""] || "";
  } catch {
    return "";
  }
}
