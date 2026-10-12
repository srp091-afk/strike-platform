import { readSplitMessages } from "@/lib/agent-models";

export function replyChunks(text: string, splitMessages: unknown) {
  const whole = text.trim();
  if (!whole) return [];
  if (!readSplitMessages(splitMessages)) return [whole];
  return splitReply(whole);
}

export function splitReply(text: string) {
  const chunks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (chunks.length > 0) {
    return chunks;
  }

  const fallback = text.trim();
  return fallback ? [fallback] : [];
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
