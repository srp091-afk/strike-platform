export function splitReply(text: string) {
  const chunks = text
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
