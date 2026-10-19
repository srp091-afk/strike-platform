import "server-only";

import type { AdFormattedBrief } from "@/lib/ad-types";
import { getOpenAI } from "@/lib/openai";

const formatPrompt = `Роль: Редактор-копирайтер. Возьми сырые заметки из чата с клиентом и преврати их в 4 лаконичных, презентабельных и стилистически ровных блока для вывода в UI-карточку.
Исправь падежи, убери мусорные слова, сделай текст дорогим и профессиональным. Не додумывай факты, только причеши формулировки.

Поля JSON:
- product — продукт / ниша
- audience — целевая аудитория
- key_advantages — ключевые преимущества бизнеса (сильные стороны, чем выделяются среди конкурентов). Явно извлеки их из сырого текста, если клиент их назвал.
- offer — Спецпредложение и Триггер (УТП): акция, подарок или ограничение из ПОСЛЕДНЕГО ответа клиента в брифе. Примеры: "Скидка 20% до пятницы", "Возьмем 2 проекта до конца месяца". Это поле позже мапится в strategy.hook_concept.

ГЛОБАЛЬНОЕ ПРАВИЛО ВАЛЮТЫ: только $ / USD или €. Без рублей и реалий СНГ.`;

const formatSchema = {
  type: "object",
  additionalProperties: false,
  required: ["product", "audience", "key_advantages", "offer"],
  properties: {
    product: { type: "string" },
    audience: { type: "string" },
    key_advantages: { type: "string" },
    offer: { type: "string" },
  },
} as const;

export function parseFormattedBrief(value: unknown): AdFormattedBrief | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const product = text(row.product);
  const audience = text(row.audience);
  const key_advantages = text(row.key_advantages);
  const offer = text(row.offer);
  if (!product || !audience || !offer) return null;
  return { product, audience, key_advantages, offer };
}

export async function formatBriefSummary(briefSummary: string): Promise<AdFormattedBrief> {
  const brief = briefSummary.replace(/\s+/g, " ").trim().slice(0, 12000);
  if (brief.length < 12) throw new Error("Бриф ещё не собран.");

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "formatted_brief",
        strict: true,
        schema: formatSchema,
      },
    },
    messages: [
      { role: "system", content: formatPrompt },
      { role: "user", content: brief },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!raw) throw new Error("Модель вернула пустой ответ.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Модель вернула не JSON.");
  }

  const briefCard = parseFormattedBrief(parsed);
  if (!briefCard || !briefCard.key_advantages) {
    throw new Error("Модель вернула бриф неверной структуры.");
  }
  return briefCard;
}

export function publicFormatError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (!message || /sk-|api[_ ]?key|bearer/i.test(message)) return "Не удалось оформить бриф.";
  return message.slice(0, 300);
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
