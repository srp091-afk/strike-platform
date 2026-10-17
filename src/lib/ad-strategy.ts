import "server-only";

import type { AdFormattedBrief, AdLeadQuestion, AdStrategy } from "@/lib/ad-types";
import { getOpenAI } from "@/lib/openai";

const strategyPrompt = `Роль: Ты — легендарный direct-response копирайтер и топовый performance-маркетолог (уровня Дэвида Огилви и Гэри Халберта). Твоя задача — взять сырой бриф клиента и превратить его в конверсионную, неординарную и пробивающую баннерную слепоту рекламную стратегию.
Ты пишешь так, что люди достают кредитки. Никакой воды, шаблонов вроде "индивидуальный подход" или "высокое качество". Только нейромаркетинг, боли, триггеры и жесткие офферы.

Входные данные:
- brief_summary: {brief_summary}
- formatted_brief.key_advantages (ключевые преимущества бизнеса): {key_advantages}
Опирайся на key_advantages при сборке выгод (benefits) и welcome_screen_bullets.

Твоя задача — сгенерировать ответ СТРОГО в формате JSON с точным соблюдением количества элементов в массивах:

{
  "strategy": {
    "target_audience_insight": "Глубокий психологический портрет ЦА (почему они на самом деле покупают, их скрытые страхи и желания).",
    "core_offer_angle": "Под каким углом мы подаем продукт, чтобы он казался уникальным (Big Idea).",
    "hook_concept": "Концепция главного крючка (кликбейта в хорошем смысле), чтобы остановить скролл."
  },
  "creatives": {
    "headlines": [
      "Заголовок 1 (до 5 слов)", "Заголовок 2", "Заголовок 3", "Заголовок 4", "Заголовок 5"
    ],
    "subheadlines": [
      "Подзаголовок 1", "Подзаголовок 2", "Подзаголовок 3", "Подзаголовок 4", "Подзаголовок 5"
    ],
    "benefits": [
      "Выгода 1", "Выгода 2", "Выгода 3", "Выгода 4", "Выгода 5",
      "Выгода 6", "Выгода 7", "Выгода 8", "Выгода 9", "Выгода 10"
    ],
    "buttons": [
      "Узнать стоимость", "Оставить заявку", "Получить предложение"
    ]
  },
  "facebook_setup": {
    "primary_texts": [
      "Текст 1: Короткий и агрессивный (Short & Punchy). Хук -> Боль -> Оффер -> Призыв.",
      "Текст 2: Сторителлинг/Нативный (Story). Жизненная ситуация -> Эмоции -> Оффер."
    ],
    "headlines": [
      "Кричащий заголовок ФБ 1 (до 40 символов)", "Заголовок ФБ 2", "Заголовок ФБ 3"
    ],
    "descriptions": [
      "Подзаголовок ФБ 1 (соц. доказательство)", "Подзаголовок ФБ 2", "Подзаголовок ФБ 3"
    ]
  },
  "lead_form": {
    "headline": "Заголовок лид-формы (обещание выгоды за заполнение).",
    "welcome_screen_bullets": [
      "Киллер-фича 1", "Киллер-фича 2", "Киллер-фича 3", "Киллер-фича 4"
    ],
    "questions": [
      {
        "question": "Квалифицирующий вопрос 1",
        "options": ["Вариант 1", "Вариант 2", "Вариант 3"]
      }
    ],
    "thank_you_screen": {
      "headline": "Заголовок экрана благодарности (например: 'Спасибо! Заявка принята')",
      "description": "Текст с призывом к следующему шагу (перейти в WhatsApp/Telegram)"
    },
    "call_to_action": "Текст на кнопке (например, 'Получить предложение')"
  }
}

КРИТИЧЕСКОЕ ПРАВИЛО ДЛЯ ВЫГОД (БЛОК БУЛЛИТОВ):
Выгоды должны опираться на 'Ключевые преимущества', собранные в брифе.
Каждая выгода (буллит) для креатива должна быть максимально сжатой, ударной и содержать СТРОГО НЕ БОЛЕЕ 5 СЛОВ.
КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ деепричастные обороты и длинные объяснения.
ПЛОХОЙ ПРИМЕР: 'Больше свободного времени на игры с детьми вместо домашних дел.'
ХОРОШИЙ ПРИМЕР: 'Больше времени на семью.'
ПЛОХОЙ ПРИМЕР: 'Вечер вдвоем без обязательного пункта сначала убраться.'
ХОРОШИЙ ПРИМЕР: 'Свободные вечера без уборки.'
Считай слова. Если слов больше 5 — переписывай.

Дополнительно: все строки — живой русский текст по этому брифу. Не оставляй плейсхолдеры из примера. Заголовки креативов — до 5 слов. Заголовки Facebook — до 40 символов. В questions от 2 до 4 вопросов, у каждого от 2 до 4 вариантов ответа.`;

function stringList(count: number) {
  return {
    type: "array",
    minItems: count,
    maxItems: count,
    items: { type: "string" },
  };
}

const strategySchema = {
  type: "object",
  additionalProperties: false,
  required: ["strategy", "creatives", "facebook_setup", "lead_form"],
  properties: {
    strategy: {
      type: "object",
      additionalProperties: false,
      required: ["target_audience_insight", "core_offer_angle", "hook_concept"],
      properties: {
        target_audience_insight: { type: "string" },
        core_offer_angle: { type: "string" },
        hook_concept: { type: "string" },
      },
    },
    creatives: {
      type: "object",
      additionalProperties: false,
      required: ["headlines", "subheadlines", "benefits", "buttons"],
      properties: {
        headlines: stringList(5),
        subheadlines: stringList(5),
        benefits: stringList(10),
        buttons: stringList(3),
      },
    },
    facebook_setup: {
      type: "object",
      additionalProperties: false,
      required: ["primary_texts", "headlines", "descriptions"],
      properties: {
        primary_texts: stringList(2),
        headlines: stringList(3),
        descriptions: stringList(3),
      },
    },
    lead_form: {
      type: "object",
      additionalProperties: false,
      required: ["headline", "welcome_screen_bullets", "questions", "thank_you_screen", "call_to_action"],
      properties: {
        headline: { type: "string" },
        welcome_screen_bullets: stringList(4),
        questions: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["question", "options"],
            properties: {
              question: { type: "string" },
              options: {
                type: "array",
                minItems: 2,
                maxItems: 4,
                items: { type: "string" },
              },
            },
          },
        },
        thank_you_screen: {
          type: "object",
          additionalProperties: false,
          required: ["headline", "description"],
          properties: {
            headline: { type: "string" },
            description: { type: "string" },
          },
        },
        call_to_action: { type: "string" },
      },
    },
  },
} as const;

export function parseAdStrategy(value: unknown): AdStrategy | null {
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const strategy = record(root.strategy);
  const creatives = record(root.creatives);
  const facebook = record(root.facebook_setup);
  const lead = record(root.lead_form);
  if (!strategy || !creatives || !facebook || !lead) return null;

  const insight = text(strategy.target_audience_insight);
  const angle = text(strategy.core_offer_angle);
  const hook = text(strategy.hook_concept);
  const headlines = texts(creatives.headlines, 5);
  const subheadlines = texts(creatives.subheadlines, 5);
  const benefits = texts(creatives.benefits, 10);
  const buttons = texts(creatives.buttons, 3);
  const primaryTexts = texts(facebook.primary_texts, 2);
  const adHeadlines = texts(facebook.headlines, 3);
  const descriptions = texts(facebook.descriptions, 3);
  const formHeadline = text(lead.headline);
  const bullets = texts(lead.welcome_screen_bullets, 4);
  const questions = leadQuestions(lead.questions);
  const thanks = record(lead.thank_you_screen);
  const thanksHeadline = thanks ? text(thanks.headline) : "";
  const thanksDescription = thanks ? text(thanks.description) : "";
  const callToAction = text(lead.call_to_action);

  if (
    !insight ||
    !angle ||
    !hook ||
    !headlines ||
    !subheadlines ||
    !benefits ||
    !buttons ||
    !primaryTexts ||
    !adHeadlines ||
    !descriptions ||
    !formHeadline ||
    !bullets ||
    !questions ||
    !thanksHeadline ||
    !thanksDescription ||
    !callToAction
  ) {
    return null;
  }

  return {
    strategy: {
      target_audience_insight: insight,
      core_offer_angle: angle,
      hook_concept: hook,
    },
    creatives: {
      headlines,
      subheadlines,
      benefits,
      buttons,
    },
    facebook_setup: {
      primary_texts: primaryTexts,
      headlines: adHeadlines,
      descriptions,
    },
    lead_form: {
      headline: formHeadline,
      welcome_screen_bullets: bullets,
      questions,
      thank_you_screen: {
        headline: thanksHeadline,
        description: thanksDescription,
      },
      call_to_action: callToAction,
    },
  };
}

export async function generateAdStrategy(
  briefSummary: string,
  formattedBrief?: AdFormattedBrief | null,
): Promise<AdStrategy> {
  const brief = briefSummary.replace(/\s+/g, " ").trim().slice(0, 12000);
  if (brief.length < 12) throw new Error("Бриф ещё не собран.");

  const first = await requestStrategy(brief, formattedBrief);
  const parsed = readStrategy(first);
  if (parsed) return parsed;

  const second = await requestStrategy(brief, formattedBrief);
  const again = readStrategy(second);
  if (again) return again;
  throw new Error("Модель вернула стратегию неверной структуры.");
}

export function publicModelError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (!message || /sk-|api[_ ]?key|bearer/i.test(message)) return "Не удалось собрать стратегию.";
  return message.slice(0, 300);
}

async function requestStrategy(brief: string, formattedBrief?: AdFormattedBrief | null) {
  const keyAdvantages =
    formattedBrief?.key_advantages?.trim() ||
    "Ключевые преимущества не выделены отдельно — извлеки их из brief_summary.";
  const system = strategyPrompt
    .replace("{brief_summary}", brief)
    .replace("{key_advantages}", keyAdvantages);
  const userPayload = {
    brief_summary: brief,
    formatted_brief: formattedBrief
      ? {
          product: formattedBrief.product,
          audience: formattedBrief.audience,
          key_advantages: formattedBrief.key_advantages,
          offer: formattedBrief.offer,
        }
      : null,
  };

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ad_strategy",
        strict: true,
        schema: strategySchema,
      },
    },
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: `Собери рекламную стратегию по брифу и верни только JSON.\n${JSON.stringify(userPayload)}`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("Модель вернула пустой ответ.");
  return raw;
}

function readStrategy(content: string) {
  try {
    return parseAdStrategy(readJson(content));
  } catch {
    return null;
  }
}

function readJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Модель вернула не JSON.");
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function texts(value: unknown, count: number) {
  if (!Array.isArray(value) || value.length !== count) return null;
  const items = value.map((item) => text(item));
  if (items.some((item) => !item)) return null;
  return items;
}

function leadQuestions(value: unknown): AdLeadQuestion[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 4) return null;
  const questions = value.flatMap((item) => {
    const row = record(item);
    if (!row) return [];
    const question = text(row.question);
    if (!question || !Array.isArray(row.options) || row.options.length < 2 || row.options.length > 4) return [];
    const options = row.options.map((option) => text(option));
    if (options.some((option) => !option)) return [];
    return [{ question, options }];
  });
  return questions.length === value.length ? questions : null;
}
