/**
 * Конвертер Markdown (ответ ИИ) -> HTML для Telegram Bot API (parse_mode: "HTML").
 *
 * Поддерживается намеренно узкое подмножество:
 *   **текст** -> <b>текст</b>
 *   *текст*   -> <i>текст</i>
 * Всё остальное экранируется, поэтому сырой HTML из ответа модели не пролезет
 * в разметку Telegram. Переносы строк не трогаем: Telegram сам рендерит "\n"
 * как перенос, замена на <br> здесь не нужна (тег <br> Bot API не поддерживает).
 */
export function markdownToTelegramHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    // Жирный: **текст** (внутри не допускаем одиночные звёздочки по краям).
    .replace(/\*\*([^*\n][^*]*?)\*\*/g, "<b>$1</b>")
    // Курсив: *текст* одной звёздочкой, не часть **...** (уже обработан выше).
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<i>$1</i>");
}

/** Экранирование произвольного текста (например, имени клиента) для HTML-разметки Telegram. */
export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
