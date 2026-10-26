import { readSplitMessages } from "@/lib/agent-models";

const SPLIT_TAG = "[SPLIT]";

const SPLIT_RULE =
  "Если нужно отправить несколько сообщений подряд, разделяй их тегом [SPLIT]. Списки, абзацы и обычные переносы строк оставляй внутри одного сообщения. Тег [SPLIT] ставь только между отдельными сообщениями.";

const PLAIN_TEXT_RULE =
  "Никогда не используй markdown-форматирование (звездочки * или ** для жирного шрифта, решетки). Пиши только простым текстом, как обычный человек в мессенджере.";

export function systemPromptWithSplit(prompt: string, splitMessages: unknown) {
  const base = `${prompt.trim()}\n\n${PLAIN_TEXT_RULE}`;
  if (!readSplitMessages(splitMessages)) return base;
  return `${base}\n\n${SPLIT_RULE}`;
}

/** Страховка на случай, если модель проигнорировала промпт: вырезает * и ** и решетки заголовков. */
export function stripMarkdown(text: string) {
  return text
    .replace(/^[ \t]*\*[ \t]+/gm, "- ")
    .replace(/\*+/g, "")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
}

/**
 * Части ответа для всех каналов. Флаг выключен — одно сообщение с целым текстом. Включён — сначала теги [SPLIT],
 * а если модель их не поставила, режем по абзацам: иначе настройка «Дробить текст» ничего бы не меняла.
 */
export function replyChunks(rawText: string, splitMessages: unknown) {
  const text = stripMarkdown(rawText);
  if (!readSplitMessages(splitMessages)) {
    const whole = stripSplitTag(text).trim();
    return whole ? [whole] : [];
  }

  const chunks = splitReply(text);
  return chunks.length === 1 ? paragraphChunks(chunks[0]!) : chunks;
}

/** Пауза «на печать» между отдельными сообщениями: 2–4 с, чтобы не выглядеть как бот и не ловить бан (WhatsApp). */
export const SPLIT_PAUSE_MIN_MS = 2000;
export const SPLIT_PAUSE_MAX_MS = 4000;
const MAX_PARAGRAPH_CHUNKS = 8;

export function splitPauseMs() {
  return SPLIT_PAUSE_MIN_MS + Math.floor(Math.random() * (SPLIT_PAUSE_MAX_MS - SPLIT_PAUSE_MIN_MS + 1));
}

/** Абзацы (пустая строка между ними). Лишние абзацы сверх лимита склеиваются в последнее сообщение. */
export function paragraphChunks(text: string) {
  const chunks = stripSplitTag(text)
    .split(/\r?\n[ \t]*\r?\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  if (chunks.length <= MAX_PARAGRAPH_CHUNKS) return chunks;
  const head = chunks.slice(0, MAX_PARAGRAPH_CHUNKS - 1);
  return [...head, chunks.slice(MAX_PARAGRAPH_CHUNKS - 1).join("\n\n")];
}

export function splitReply(text: string) {
  return text
    .split(SPLIT_TAG)
    .map((part) => stripSplitTag(part).trim())
    .filter((part) => part.length > 0);
}

function stripSplitTag(text: string) {
  return text.split(SPLIT_TAG).join("");
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
