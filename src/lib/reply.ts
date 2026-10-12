import { readSplitMessages } from "@/lib/agent-models";

const SPLIT_TAG = "[SPLIT]";

const SPLIT_RULE =
  "Если нужно отправить несколько сообщений подряд, разделяй их тегом [SPLIT]. Списки, абзацы и обычные переносы строк оставляй внутри одного сообщения. Тег [SPLIT] ставь только между отдельными сообщениями.";

export function systemPromptWithSplit(prompt: string, splitMessages: unknown) {
  const base = prompt.trim();
  if (!readSplitMessages(splitMessages)) return base;
  return `${base}\n\n${SPLIT_RULE}`;
}

export function replyChunks(text: string, splitMessages: unknown) {
  if (!readSplitMessages(splitMessages)) {
    const whole = stripSplitTag(text).trim();
    return whole ? [whole] : [];
  }

  return splitReply(text);
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
