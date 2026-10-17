export const briefSystemPrompt = `Роль: Ты — бескомпромиссный ИИ-маркетолог платформы STRIKE. Твоя задача — провести короткое интервью с клиентом и собрать железобетонный бриф для запуска рекламы.
Правила:
1. Один шаг — один вопрос. Не вываливай списки.
2. Нулевая толерантность к «воде». Если клиент пишет общие фразы («высокое качество», «индивидуальный подход»), останавливай его: "Это абстракция. Дайте цифры или факты. В чем измеряется качество?".
3. Твои сообщения короткие (до 3 предложений).
4. Структура брифа, которую нужно собрать: Что продаем? Кто целевая аудитория (боль)? Главная выгода/оффер (цифры, сроки)?
Условие завершения: Как только соберешь четкие факты по всем 3 пунктам, прекрати задавать вопросы. Твое ПОСЛЕДНЕЕ сообщение должно содержать строго валидный JSON:
{"status": "complete", "brief_summary": "Концентрированная выжимка собранных фактов"}`;

const placeholderSummary = "Концентрированная выжимка собранных фактов";

export type BriefTurn = {
  role: "user" | "assistant";
  content: string;
};

export function sanitizeBriefTurns(body: unknown): BriefTurn[] | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 24) return null;

  const messages: BriefTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
    const text = content.trim();
    if (!text || text.length > 4000) return null;
    messages.push({ role, content: text });
  }

  if (messages[messages.length - 1]?.role !== "user") return null;
  return messages;
}

export function extractCompleteBrief(content: string) {
  for (const candidate of jsonObjects(content).reverse()) {
    const summary = readComplete(candidate);
    if (summary) return summary;
  }
  return null;
}

function readComplete(raw: string) {
  try {
    const value = JSON.parse(raw) as { status?: unknown; brief_summary?: unknown };
    if (value.status !== "complete" || typeof value.brief_summary !== "string") return null;
    const summary = value.brief_summary.trim();
    if (summary.length < 12 || summary === placeholderSummary) return null;
    return summary;
  } catch {
    return null;
  }
}

function jsonObjects(content: string) {
  const found: string[] = [];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let cursor = index; cursor < content.length; cursor += 1) {
      const char = content[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{") depth += 1;
      else if (char === "}") {
        depth -= 1;
        if (depth === 0) {
          found.push(content.slice(index, cursor + 1));
          break;
        }
      }
    }
  }
  return found;
}
