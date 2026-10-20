/**
 * Normalize badge (УТП/триггер) copy for display.
 *
 * No mechanical word truncation: cutting by word count produced broken
 * fragments ("...ДО КОНЦА"). The generation prompt is responsible for a
 * grammatically complete phrase of up to 8 words; here we only collapse
 * whitespace and trim.
 */
export function limitBadgeWords(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}
