import { connection } from "next/server";

import { deniedStatus, getEffectiveUserId } from "@/lib/account-context";
import { findAvatar } from "@/lib/sites/ai-avatars";
import { requestAvatarVideo } from "@/lib/sites/avatar-provider";
import { getOwnedSite } from "@/lib/sites/store";
import type { VoiceLocale, VoiceStyle } from "@/lib/sites/quiz-schema";

export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  await connection();
  try {
    await getEffectiveUserId();
    const body = (await request.json()) as {
      siteId?: string;
      stepId?: string;
      avatarId?: string;
      script?: string;
      voiceStyle?: VoiceStyle;
      locale?: VoiceLocale;
    };
    const siteId = body.siteId ?? "";
    const stepId = (body.stepId ?? "").slice(0, 40);
    const script = (body.script ?? "").trim().slice(0, 500);
    const avatar = findAvatar(body.avatarId);
    if (!UUID.test(siteId) || !stepId || !avatar || script.length < 8) {
      return Response.json({ error: "Некорректный запрос." }, { status: 400 });
    }
    const site = await getOwnedSite(siteId);
    if (!site || site.siteType !== "quiz") return Response.json({ error: "Квиз не найден." }, { status: 404 });
    const voiceStyle: VoiceStyle = body.voiceStyle === "calm" || body.voiceStyle === "friendly" ? body.voiceStyle : "confident";
    const locale: VoiceLocale = body.locale === "en" || body.locale === "es" || body.locale === "de" ? body.locale : "ru";
    const result = await requestAvatarVideo({ siteId, stepId, avatarId: avatar.id, script, voiceStyle, locale });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Нужно войти") ? "Нужно войти." : error instanceof Error ? error.message : "Не удалось поставить видео в очередь.";
    return Response.json({ error: message }, { status: deniedStatus(error, message === "Нужно войти." ? 401 : 500) });
  }
}
