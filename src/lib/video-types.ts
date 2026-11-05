/** Общие типы интеграции с STRIKE Video Engine (без server-only: используются и на клиенте). */

export type VideoMode = "avatar" | "broll";

export type VideoStatus = {
  jobId: string;
  status: "processing" | "completed" | "failed";
  stage: string;
  errorMessage: string | null;
  downloaded: boolean;
};

export const VIDEO_JOB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Этапы пайплайна движка: подпись для пользователя и условный прогресс. */
const STAGES: Record<string, { label: string; percent: number }> = {
  queued: { label: "В очереди…", percent: 3 },
  tts: { label: "Генерация голоса…", percent: 20 },
  visual: { label: "Создание видеоряда…", percent: 45 },
  transcription: { label: "Расшифровка речи…", percent: 70 },
  subtitles: { label: "Субтитры…", percent: 82 },
  render: { label: "Монтаж…", percent: 92 },
  done: { label: "Готово", percent: 100 },
};

export function describeStage(stage: string) {
  return STAGES[stage] ?? { label: "Обработка…", percent: 10 };
}
