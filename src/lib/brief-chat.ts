export const briefSystemPrompt = `Роль: Ты — дружелюбный, вовлеченный ИИ-маркетолог платформы STRIKE. Общаешься открыто, по-приятельски, как профи, который помогает партнеру запустить крутую рекламу.
Твоя задача — собрать бриф (Продукт, ЦА/Боли, Главная выгода/Оффер в цифрах).

Правила:
1. Эмпатия и фиксация: Обязательно хвали и кратко фиксируй то, что сказал клиент (например: "Супер, записал: красим премиум авто за 5 дней. Теперь давай уточним...").
2. Фильтр воды: Если клиент пишет абстракции ("индивидуальный подход"), мягко, по-дружески попроси цифры: "Звучит классно, но давай оцифруем для рекламы. Что именно значит 'индивидуальный' в вашем случае?".
3. Глубокий анализ ниши: На каждом вопросе ты должен глубоко проанализировать нишу клиента и предложить 3-4 максимально сильных, конвертящих варианта ответа (факты, боли, офферы), чтобы клиенту было проще.
4. ОДИН ответ бота — это строго JSON объект:
{
  "message": "Текст твоего ответа/вопроса",
  "suggestions": ["вариант 1", "вариант 2", "вариант 3"],
  "status": "in_progress" | "confirm" | "complete",
  "brief_summary": "текущая выжимка (заполняется только на статусе confirm или complete)"
}

Логика статусов:
- "in_progress" — пока собираешь данные.
- "confirm" — когда ты собрал все факты. Выведи итоговое резюме в "message" и спроси: "Всё верно или хочешь что-то добавить?". В "suggestions" передай ["Да, всё супер, генерируем!", "Хочу добавить деталь"].
- "complete" — когда клиент подтвердил резюме (нажал "Да").
5. АЛГОРИТМ ЗАВЕРШЕНИЯ ДИАЛОГА (СТРОГИЕ ЛИМИТЫ):
Ты ОБЯЗАН перевести статус в "confirm", вывести итоговое резюме в "message" и ждать подтверждения пользователя, если срабатывает ОДНО ИЗ ТРЕХ условий:
- УСЛОВИЕ 1 (Успешный сбор): Ты четко закрыл все 3 базовых блока (1. Продукт, 2. Боль ЦА, 3. Твердый оффер/цифры). Как только они есть — сразу финализируй.
- УСЛОВИЕ 2 (Жесткий лимит шагов): Диалог достиг максимума в 10 твоих вопросов. Это хард-лимит. Задавать 11-й вопрос ЗАПРЕЩЕНО. На 11-м шаге принудительно формируй резюме из того, что успел собрать.
- УСЛОВИЕ 3 (Защита от уклонения): Если пользователь 2 раза подряд льет "воду", игнорирует вопрос или отказывается давать конкретику — прекращай допрос. Формируй резюме на базе того, что есть.`;

const placeholderSummary = "текущая выжимка (заполняется только на статусе confirm или complete)";

const confirmSuggestions = ["Да, всё супер, генерируем!", "Хочу добавить деталь"];

export type BriefStatus = "in_progress" | "confirm" | "complete";

export type BriefReply = {
  message: string;
  suggestions: string[];
  status: BriefStatus;
  briefSummary: string | null;
};

export type BriefTurn = {
  role: "user" | "assistant";
  content: string;
};

export function readBriefHistory(value: unknown) {
  if (!Array.isArray(value)) return [];
  const messages: BriefTurn[] = [];
  for (const item of value.slice(-24)) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
    const text = content.trim();
    if (!text || text.length > 4000) continue;
    messages.push({ role, content: text });
  }
  return messages;
}

export function sanitizeBriefTurns(body: unknown): BriefTurn[] | null {
  if (!body || typeof body !== "object") return null;
  const messages = readBriefHistory((body as { messages?: unknown }).messages);
  if (messages.length === 0 || messages[messages.length - 1]?.role !== "user") return null;
  return messages;
}

export function applyQuestionLimit(turns: BriefTurn[], reply: BriefReply): BriefReply {
  const asked = turns.filter((turn) => turn.role === "assistant").length;
  if (asked < 10 || reply.status !== "in_progress") return reply;
  const summary = reply.briefSummary ?? knownFacts(turns);
  return {
    message: `${summary}\n\nВсё верно или хочешь что-то добавить?`,
    suggestions: confirmSuggestions,
    status: "confirm",
    briefSummary: summary,
  };
}

export function knownFacts(turns: BriefTurn[]) {
  const text = turns
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content)
    .join(". ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 700) || "Бриф собран по тем фактам, которые уже есть.";
}

export function parseBriefReply(content: string): BriefReply | null {
  const trimmed = content.trim();
  const direct = readReply(trimmed);
  if (direct) return direct;
  const first = jsonObjects(content)[0];
  if (!first || first === trimmed) return null;
  return readReply(first);
}

function readReply(raw: string): BriefReply | null {
  try {
    const value = JSON.parse(raw) as {
      message?: unknown;
      suggestions?: unknown;
      status?: unknown;
      brief_summary?: unknown;
    };
    const message = typeof value.message === "string" ? value.message.trim() : "";
    if (!message) return null;

    let suggestions = normalizeSuggestions(value.suggestions).slice(0, 4);
    const briefSummary = readSummary(value.brief_summary);
    let status: BriefStatus = "in_progress";
    if (value.status === "confirm" || value.status === "complete" || value.status === "in_progress") {
      status = value.status;
    }
    if (status === "complete" && !briefSummary) status = "confirm";
    if (status === "confirm" && suggestions.length === 0) suggestions = confirmSuggestions;

    return { message, suggestions, status, briefSummary };
  } catch {
    return null;
  }
}

function normalizeSuggestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function readSummary(value: unknown) {
  if (typeof value !== "string") return null;
  const summary = value.trim();
  if (summary.length < 12 || summary === placeholderSummary) return null;
  return summary;
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
