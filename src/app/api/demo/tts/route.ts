import type { NextRequest } from "next/server";

import { clientIp, isRateLimited } from "@/lib/demo-rate-limit";
import { getOpenAI } from "@/lib/openai";

export const maxDuration = 30;

/** Один запрос — одно предложение; длинный текст не принимаем, чтобы не тратить токены впустую. */
const MAX_TEXT_CHARS = 600;
// На один ответ агента уходит несколько запросов (по предложению), поэтому лимит выше, чем у чата.
const RATE_MAX_REQUESTS = 120;

export async function POST(request: NextRequest) {
  if (isRateLimited("demo-tts", clientIp(request), RATE_MAX_REQUESTS)) {
    return Response.json({ error: "Слишком много запросов. Попробуйте чуть позже." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_CHARS) : "";
  if (!text) {
    return Response.json({ error: "Нужен непустой text." }, { status: 400 });
  }

  try {
    const speech = await getOpenAI().audio.speech.create(
      { model: "tts-1", voice: "shimmer", input: text, response_format: "mp3" },
      { signal: request.signal },
    );
    const audio = await speech.arrayBuffer();
    return new Response(audio, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (!request.signal.aborted) {
      console.error("[demo tts]", error instanceof Error ? error.message : error);
    }
    return Response.json({ error: "Не удалось озвучить текст." }, { status: 502 });
  }
}
