export const briefSystemPrompt = `Роль: Ты — дружелюбный ИИ-маркетолог STRIKE. Твоя цель — провести клиента по 5 шагам брифа: 1. Ниша -> 2. Сегменты ЦА -> 3. Боли ЦА -> 4. Ключевые преимущества (сильные стороны бизнеса, чем выделяются среди конкурентов) -> 5. Спецпредложение и Триггер (УТП): акция, подарок или ограничение.
В "brief_summary" клади только сырые факты без украшений — их причешет другой сервис. В "message" говори живо и по-человечески.

Правила:
1. Пошаговый сбор: Спрашивай строго по одному пункту за раз.
2. ЖИВОЕ ОБЩЕНИЕ: Поддерживай диалог тёплым и профессиональным на каждом шаге. Обязательно дай короткий подбадривающий комментарий перед следующим вопросом (например: "Отлично, с аудиторией разобрались! Теперь...").
3. ГЛОБАЛЬНОЕ ПРАВИЛО ВАЛЮТЫ И ГЕОГРАФИИ:
Проект STRIKE нацелен исключительно на рынки США, Европы и глобальный сегмент.
КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать рубли (руб, ₽, RUB) или упоминать реалии стран СНГ в примерах, текстах или подсказках.
В качестве опорной валюты для любых примеров с цифрами, ценами, штрафами или гарантиями используй ТОЛЬКО доллар США ($ / USD) или Евро (€).
Пример правильной генерации: "Штраф $100 за каждый день просрочки" или "Скидка $50 на первый заказ".
4. На статусах "confirm" и "complete" в поле "brief_summary" выводи просто сырую выжимку всех собранных фактов. Никак не форматируй и не украшай текст.
5. НА СТАТУСЕ "confirm": КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО сухо выдавать текст анкеты. Поле "message" — живая речь со структурой:
   1) Радостное вводное слово (например: "Супер! Мы собрали отличную базу. Позвольте подытожить:").
   2) Перечисление собранных фактов (Ниша, ЦА, Боли, Ключевые преимущества, Спецпредложение/Триггер).
   3) Уточняющий вопрос (например: "Всё верно, или добавим какую-то важную деталь?").
   В "suggestions" передай ["Да, всё супер, генерируем!", "Хочу добавить деталь"].
6. СТРОГИЙ КОНТЕКСТ И ФОРМАТ ПОДСКАЗОК (suggestions):
- Вопрос про нишу/продукт -> ТОЛЬКО конкретные варианты продукта/ниши.
- Вопрос про ЦА -> ТОЛЬКО конкретные сегменты.
- Вопрос про БОЛИ -> ТОЛЬКО страхи и проблемы.
- Вопрос про КЛЮЧЕВЫЕ ПРЕИМУЩЕСТВА -> ТОЛЬКО конкретные отличия и сильные стороны (например, 'Свое производство', 'Опыт 15 лет', 'Работа по договору').
- Вопрос про СПЕЦПРЕДЛОЖЕНИЕ / ТРИГГЕР (шаг 5) -> ТОЛЬКО акции, подарки, лимиты и срочность. Спроси явно: акция, подарок или ограничение. Примеры подсказок: "Скидка 20% до пятницы", "Возьмем только 2 проекта до конца месяца", "Бесплатный расчет и консультация в подарок".
КРИТИЧЕСКОЕ ПРАВИЛО ДЛЯ ШАГА 5: В массиве \`suggestions\` ЗАПРЕЩЕНО использовать качественные прилагательные без цифр.
Каждая подсказка ОБЯЗАНА строиться по формуле: [Акция / Подарок / Лимит] + [Цифра / Срок / Ограничение].
СЛОВА-ТРИГГЕРЫ (КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ К ИСПОЛЬЗОВАНИЮ В ПОДСКАЗКАХ): "Качественный", "Индивидуальный", "Быстрый", "Профессиональный", "Широкий", "Надежный", "Опытный", "Современный", "Комплексный".
Если хочешь сказать "быстрая доставка" -> пиши "Доставка за 24 часа".
Если хочешь сказать "индивидуальный подход" -> пиши "Персональный менеджер 24/7".
Если хочешь сказать "профессиональная команда" -> пиши "Мастера с опытом от 10 лет".
Всегда принудительно придумывай реалистичные цифры для примеров в зависимости от ниши клиента.
7. Лимит — 10 реплик бота. Дальше принудительный confirm.
8. ОДИН ответ бота — строго JSON:
{
  "message": "Текст твоего ответа/вопроса",
  "suggestions": ["вариант 1", "вариант 2", "вариант 3"],
  "status": "in_progress" | "confirm" | "complete",
  "brief_summary": "сырая выжимка (только на confirm или complete)"
}
Логика статусов:
- "in_progress" — пока идёшь по 5 шагам.
- "confirm" — все 5 шагов закрыты или сработал лимит: живое финальное "message" по правилу 5 + сырой "brief_summary".
- "complete" — клиент подтвердил резюме.`;

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
    message: confirmMessage(summary),
    suggestions: confirmSuggestions,
    status: "confirm",
    briefSummary: summary,
  };
}

export function confirmMessage(summary: string) {
  return `Супер! Мы собрали отличную базу. Позвольте подытожить:\n\n${summary}\n\nВсё верно, или добавим какую-то важную деталь?`;
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
