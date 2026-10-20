import { getAuthenticatedUserId } from "@/lib/auth-user";
import { readBriefHistory, type BriefTurn } from "@/lib/brief-chat";
import { getOpenAI } from "@/lib/openai";
import {
  filterSuggestions,
  splitSelectedTexts,
  SUGGESTION_CATEGORY_LABELS,
  suggestionCategory,
} from "@/lib/suggestion-filter";

export const maxDuration = 30;

const MAX_ATTEMPTS = 3;
const TARGET_COUNT = 3;

export async function POST(request: Request) {
  try {
    await getAuthenticatedUserId();
  } catch {
    return Response.json({ error: "Нужно войти через Google." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный JSON." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as { history?: unknown; draftText?: unknown }) : {};
  const history = readBriefHistory(record.history);
  const draftText = typeof record.draftText === "string" ? record.draftText.trim().slice(0, 4000) : "";

  try {
    const suggestions = await generateFreshSuggestions(history, draftText);
    return Response.json({ suggestions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message || /sk-|api[_ ]?key/i.test(message)) {
      return Response.json({ error: "Не удалось обновить подсказки." }, { status: 500 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

/**
 * The pool must NEVER run dry while the user keeps picking: every batch is
 * filtered against the draft (exact duplicates + stem-category conflicts),
 * and if filtering leaves too little, the model is re-asked for variants
 * from completely different aspects — up to MAX_ATTEMPTS times.
 */
async function generateFreshSuggestions(history: BriefTurn[], draftText: string): Promise<string[]> {
  const selectedFragments = splitSelectedTexts([draftText]);
  const bannedCategories = Array.from(
    new Set(
      selectedFragments
        .map((fragment) => suggestionCategory(fragment))
        .filter((category): category is string => category !== null),
    ),
  );

  const collected: string[] = [];
  // Everything the model already produced (even filtered-out items) is
  // excluded from later attempts, so retries can't repeat themselves.
  const attempted: string[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const previousAttempted = [...attempted];
    const raw = await requestSuggestions(history, draftText, {
      attempt,
      selectedFragments,
      bannedCategories,
      attempted,
    });
    attempted.push(...raw);

    const fresh = filterSuggestions(raw, [draftText, ...collected, ...previousAttempted]);
    for (const item of fresh) {
      if (!collected.includes(item)) collected.push(item);
    }
    if (collected.length >= TARGET_COUNT) break;
  }

  return collected.slice(0, 4);
}

async function requestSuggestions(
  history: BriefTurn[],
  draftText: string,
  context: {
    attempt: number;
    selectedFragments: string[];
    bannedCategories: string[];
    attempted: string[];
  },
): Promise<string[]> {
  const { attempt, selectedFragments, bannedCategories, attempted } = context;

  const exclusions: string[] = [];
  if (selectedFragments.length > 0) {
    exclusions.push(
      `УЖЕ ВЫБРАНО пользователем (НЕ повторяй и НЕ перефразируй): ${selectedFragments.map((item) => `"${item}"`).join(", ")}.`,
    );
  }
  if (bannedCategories.length > 0) {
    exclusions.push(
      `ЗАПРЕЩЁННЫЕ ТЕМЫ (эти аспекты уже закрыты, варианты с другими цифрами/цифрами лет тоже запрещены): ${bannedCategories
        .map((category) => SUGGESTION_CATEGORY_LABELS[category] ?? category)
        .join("; ")}.`,
    );
  }
  if (attempt > 0 && attempted.length > 0) {
    exclusions.push(
      `Предыдущие попытки (${attempted.map((item) => `"${item}"`).join(", ")}) были отброшены как дубли/конфликты. Предложи ПРИНЦИПИАЛЬНО ИНЫЕ аспекты и углы, которых ещё не было: другие сильные стороны бизнеса, сервис, команда, география, технологии, ассортимент, условия работы — всё, что ещё не названо.`,
    );
  }

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4 + attempt * 0.25,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Ты — ИИ-маркетолог. Пользователь формирует ответ на твой ПОСЛЕДНИЙ вопрос (возьми его из истории).
Его текущий черновик ответа: "${draftText}".
Предложи 4 коротких варианта, которые СТРОГО отвечают на ПОСЛЕДНИЙ вопрос и логично дополняют черновик.
${exclusions.join("\n")}
Контекст:
- Вопрос про ЦА -> ТОЛЬКО конкретные сегменты.
- Вопрос про БОЛИ -> ТОЛЬКО страхи и проблемы. Не предлагай выгоды.
- Вопрос про КЛЮЧЕВЫЕ ПРЕИМУЩЕСТВА -> ТОЛЬКО конкретные отличия и сильные стороны (например, 'Свое производство', 'Опыт 15 лет', 'Работа по договору').
- Вопрос про ОФФЕР -> ТОЛЬКО оцифрованные факты по формуле: [Конкретная услуга/Факт] + [Цифра / Срок / Гарантия в деньгах].
КРИТИЧЕСКОЕ ПРАВИЛО ДЛЯ ОФФЕРОВ: ЗАПРЕЩЕНЫ качественные прилагательные и маркетинг-клише.
СЛОВА-ТРИГГЕРЫ (ЗАПРЕЩЕНЫ): "Качественный", "Индивидуальный", "Быстрый", "Профессиональный", "Широкий", "Надежный", "Опытный", "Современный", "Комплексный".
Плохо: "быстрая доставка", "индивидуальный подход", "профессиональная команда".
Хорошо: "Доставка за 24 часа", "Персональный менеджер 24/7", "Мастера с опытом от 10 лет", "Штраф $100 за каждый день просрочки".
Всегда подставляй реалистичные цифры под нишу клиента.
ГЛОБАЛЬНОЕ ПРАВИЛО ВАЛЮТЫ И ГЕОГРАФИИ:
Проект STRIKE нацелен исключительно на рынки США, Европы и глобальный сегмент.
КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО использовать рубли (руб, ₽, RUB) или упоминать реалии стран СНГ в примерах, текстах или подсказках.
В качестве опорной валюты для любых примеров с цифрами, ценами, штрафами или гарантиями используй ТОЛЬКО доллар США ($ / USD) или Евро (€).
Пример правильной генерации: "Штраф $100 за каждый день просрочки" или "Скидка $50 на первый заказ".
Верни JSON: { "suggestions": ["вариант 1", "вариант 2", "вариант 3", "вариант 4"] }`,
      },
      ...history,
    ],
  });
  const reply = completion.choices[0]?.message?.content?.trim() ?? "";
  return readSuggestions(reply);
}

function readSuggestions(content: string) {
  try {
    const value = JSON.parse(content) as { suggestions?: unknown };
    if (!Array.isArray(value.suggestions)) return [];
    return value.suggestions
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
  } catch {
    return [];
  }
}
