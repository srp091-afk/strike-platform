import type { NextRequest } from "next/server";

import { clientIp, isRateLimited } from "@/lib/demo-rate-limit";

export const maxDuration = 30;

/** ElevenLabs, голос Rachel (живее и динамичнее на русском, чем Antoni). */
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const ENDPOINT = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

/** Один запрос — один кусок реплики; длинный текст не принимаем, чтобы не тратить символы впустую. */
const MAX_TEXT_CHARS = 600;
// На один ответ агента уходит несколько запросов (по предложению), поэтому лимит выше, чем у чата.
const RATE_MAX_REQUESTS = 120;

export async function POST(request: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ error: "ELEVENLABS_API_KEY is not set" }, { status: 503 });
  }

  if (isRateLimited("demo-tts", clientIp(request), RATE_MAX_REQUESTS)) {
    return Response.json({ error: "Слишком много запросов. Попробуйте чуть позже." }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_CHARS) : "";
  if (!text) {
    return Response.json({ error: "Нужен непустой text." }, { status: 400 });
  }

  try {
    const upstream = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.55, // ниже — больше эмоций и живости
          similarity_boost: 0.85, // чётче и ближе к оригиналу голоса
          style: 0.15, // немного утрированный стиль для естественных интонаций
          use_speaker_boost: true,
        },
      }),
      signal: request.signal,
    });

    if (!upstream.ok) {
      console.error("[demo tts] elevenlabs", upstream.status, (await upstream.text().catch(() => "")).slice(0, 300));
      return Response.json({ error: "Не удалось озвучить текст." }, { status: 502 });
    }

    const audio = await upstream.arrayBuffer();
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
