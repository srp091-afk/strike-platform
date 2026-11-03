import type { NextRequest } from "next/server";
import { toFile } from "openai";

import { clientIp, isRateLimited } from "@/lib/demo-rate-limit";
import { getOpenAI } from "@/lib/openai";

export const maxDuration = 30;

/** Реплика клиента — это секунды речи; больше не принимаем, чтобы не тратить деньги на мусор. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const RATE_MAX_REQUESTS = 60;

/** Whisper на тишине и шуме «дорисовывает» типовые фразы из субтитров — такие результаты отбрасываем. */
const HALLUCINATION =
  /^(?:\W*(?:продолжение следует|субтитры\b.*|редактор субтитров.*|спасибо за просмотр|thanks? for watching|thank you for watching|subtitles by.*|amara\.org.*)\W*)$/i;

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

/** Распознавание речи через OpenAI Whisper: язык определяется автоматически (параметр language не передаём). */
export async function POST(request: NextRequest) {
  if (isRateLimited("demo-stt", clientIp(request), RATE_MAX_REQUESTS)) {
    return Response.json({ error: "Слишком много запросов. Попробуйте чуть позже." }, { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return Response.json({ error: "Нужен аудиофайл в поле audio." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Запись слишком длинная." }, { status: 413 });
  }

  const mime = audio.type.split(";")[0]?.trim().toLowerCase() ?? "";
  const extension = EXTENSIONS[mime];
  if (!extension) {
    return Response.json({ error: "Неподдерживаемый формат аудио." }, { status: 415 });
  }

  try {
    const file = await toFile(Buffer.from(await audio.arrayBuffer()), `speech.${extension}`, { type: mime });
    const result = await getOpenAI().audio.transcriptions.create({
      file,
      model: "whisper-1",
      temperature: 0,
    });
    const text = result.text.trim();
    return Response.json({ text: HALLUCINATION.test(text) ? "" : text });
  } catch (error) {
    console.error("[demo stt]", error instanceof Error ? error.message : error);
    return Response.json({ error: "Не удалось распознать речь. Попробуйте ещё раз." }, { status: 502 });
  }
}
