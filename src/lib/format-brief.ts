import "server-only";

import type { AdFormattedBrief } from "@/lib/ad-types";
import { getOpenAI } from "@/lib/openai";

const formatPrompt =
  "Роль: Редактор-копирайтер. Возьми сырые заметки из чата с клиентом и преврати их в 3 лаконичных, презентабельных и стилистически ровных абзаца для вывода в UI-карточку. Исправь падежи, убери мусорные слова, сделай текст дорогим и профессиональным. Не додумывай факты, только причеши формулировки.";

const formatSchema = {
  type: "object",
  additionalProperties: false,
  required: ["product", "audience", "offer"],
  properties: {
    product: { type: "string" },
    audience: { type: "string" },
    offer: { type: "string" },
  },
} as const;

export function parseFormattedBrief(value: unknown): AdFormattedBrief | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const product = text(row.product);
  const audience = text(row.audience);
  const offer = text(row.offer);
  if (!product || !audience || !offer) return null;
  return { product, audience, offer };
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
  if (!briefCard) throw new Error("Модель вернула бриф неверной структуры.");
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
