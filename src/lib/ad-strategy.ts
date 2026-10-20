import "server-only";

import type { AdFormattedBrief, AdLeadQuestion, AdStrategy } from "@/lib/ad-types";
import { getOpenAI } from "@/lib/openai";

const strategyPrompt = `Роль: Ты — легендарный direct-response копирайтер и топовый performance-маркетолог (уровня Дэвида Огилви и Гэри Халберта). Твоя задача — взять сырой бриф клиента и превратить его в конверсионную, неординарную и пробивающую баннерную слепоту рекламную стратегию.
Ты пишешь так, что люди достают кредитки. Никакой воды, но максимум маркетинговой психологии.

Входные данные:
- brief_summary: {brief_summary}
- formatted_brief.key_advantages (ключевые преимущества бизнеса): {key_advantages}
- formatted_brief.offer (Спецпредложение и Триггер / УТП): {offer}
Опирайся на key_advantages при сборке выгод (benefits) и welcome_screen_bullets.
Поле hook_concept ОБЯЗАНО опираться на formatted_brief.offer (акция / подарок / ограничение). Сохрани смысл спецпредложения клиента.

ПРАВИЛА ГЕНЕРАЦИИ (КРИТИЧЕСКИ ВАЖНО):
1. БЛОК СТРАТЕГИИ (target_audience_insight, core_offer_angle, hook_concept):
ЗДЕСЬ НЕТ ОГРАНИЧЕНИЙ ПО ДЛИНЕ для insight и offer_angle. Пиши глубоко, развернуто и нестандартно. Вскрывай истинные, неочевидные и глубинные боли аудитории. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ ленивые отписки вроде "Они хотят надежности и доступных решений". Расписывай портрет так, будто ты психолог.
hook_concept = «Спецпредложение и Триггер (УТП)»: возьми текст из formatted_brief.offer (последний ответ брифа про акцию/подарок/лимит) и при необходимости слегка отполируй, НЕ выдумывая новую акцию.

2. ЗАГОЛОВКИ (headlines) И ПОДЗАГОЛОВКИ (subheadlines):
- ЗАГОЛОВОК (СТРОГО до 5-6 слов): цепляет внимание, бьет в боль, вызывает острую эмоцию, интригу или дерзость.
- ПОДЗАГОЛОВОК (ДО 9 СЛОВ): логически добивает клиента. Используй это пространство, чтобы снять главное возражение, дать твердый факт, измеримую цифру, срок или гарантию. Должен звучать как уверенный аргумент и полноценная мысль, а не как дубликат буллита.

КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ унылые штампы: "Ваш идеальный помощник", "Решение для бизнеса", "Высокое качество", "Надежный выбор", "Индивидуальный подход", "Индивидуальный подход гарантирован".

ПРИМЕРЫ УДАРНЫХ ЗАГОЛОВКОВ (до 5-6 слов):
- "Окупится до первого платежа" (Триггер: ROI / Деньги)
- "Верните себе свободные выходные" (Триггер: Время / Избавление от рутины)
- "Хватит сливать бюджет в трубу" (Триггер: Боль / Разочарование)
- "Платите только за реальный результат" (Триггер: Безопасность / Гарантия)
- "Соседи будут молча завидовать" (Триггер: Статус / Эго)

ПРИМЕРЫ ПРОБИВНЫХ ПОДЗАГОЛОВКОВ (до 9 слов):
- "Установим за 1 день по договору или вернем деньги" (Твердый факт + Гарантия)
- "Первые видимые результаты уже через 14 дней без срывов" (Измеримая скорость + Снятие страха)
- "Полностью прозрачная смета без скрытых комиссий и внезапных переплат" (Закрытие страха)
- "Всю рутину и грязную работу берем полностью на себя" (Понятная механика услуги)
- "Заменим деталь бесплатно в течение 24 часов после заявки" (Сервис + Скорость)

3. ВЫГОДЫ ДЛЯ КРЕАТИВОВ (benefits):
СТРОГО НЕ БОЛЕЕ 5 СЛОВ на один пункт. Опирайся на 'key_advantages'. Максимально сжато, хлестко и с фактами.
КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНЫ деепричастные обороты и длинные объяснения.
ПЛОХОЙ ПРИМЕР: 'Больше свободного времени на игры с детьми вместо домашних дел.'
ХОРОШИЙ ПРИМЕР: 'Больше времени на семью.'
ПЛОХОЙ ПРИМЕР: 'Вечер вдвоем без обязательного пункта сначала убраться.'
ХОРОШИЙ ПРИМЕР: 'Свободные вечера без уборки.'
Считай слова. Если слов больше 5 — переписывай.

Твоя задача — сгенерировать ответ СТРОГО в формате JSON с точным соблюдением количества элементов в массивах:
{
  "strategy": {
    "target_audience_insight": "...",
    "core_offer_angle": "...",
    "hook_concept": "..."
  },
  "creatives": {
    "headlines": [5 шт, до 5-6 слов],
    "subheadlines": [5 шт, ДО 9 СЛОВ],
    "benefits": [10 шт, строго до 5 слов],
    "buttons": [3 шт]
  },
  "facebook_setup": { ... },
  "lead_form": { ... }
}

Дополнительно: все строки — живой русский текст по этому брифу. Не оставляй плейсхолдеры из примера. Заголовки Facebook — до 40 символов. В questions от 2 до 4 вопросов, у каждого от 2 до 4 вариантов ответа.`;

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
        badges: stringList(5),
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
  // Badges are optional in stored strategies; default to the hook trigger.
  const badges = Array.isArray(creatives.badges)
    ? creatives.badges.map((item) => text(item)).filter(Boolean).slice(0, 8)
    : [];
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
      badges: badges.length > 0 ? badges : [hook],
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
  if (parsed) return applyOfferToHook(parsed, formattedBrief);

  const second = await requestStrategy(brief, formattedBrief);
  const again = readStrategy(second);
  if (again) return applyOfferToHook(again, formattedBrief);
  throw new Error("Модель вернула стратегию неверной структуры.");
}

/** Force brief offer (УТП / акция) into strategy.hook_concept — DB key stays hook_concept. */
function applyOfferToHook(strategy: AdStrategy, formattedBrief?: AdFormattedBrief | null): AdStrategy {
  const offer = formattedBrief?.offer?.trim();
  if (!offer) return strategy;
  return {
    ...strategy,
    strategy: {
      ...strategy.strategy,
      hook_concept: offer,
    },
  };
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
  const offer =
    formattedBrief?.offer?.trim() ||
    "Спецпредложение не выделено отдельно — извлеки акцию/подарок/лимит из brief_summary в hook_concept.";
  const system = strategyPrompt
    .replace("{brief_summary}", brief)
    .replace("{key_advantages}", keyAdvantages)
    .replace("{offer}", offer);
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
    mapping_rule:
      "Save the client's special offer / trigger (formatted_brief.offer) into strategy.hook_concept. Do not invent a different promo.",
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
