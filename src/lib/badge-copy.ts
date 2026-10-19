/** Squeeze marketing trigger copy into a badge of 1–6 words. */
export function limitBadgeWords(value: string | null | undefined, maxWords = 6): string {
  const words = (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length === 0) return "";
  return words.slice(0, Math.max(1, maxWords)).join(" ");
}
