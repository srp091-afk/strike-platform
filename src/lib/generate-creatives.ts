import "server-only";

import { randomUUID } from "crypto";
import Replicate from "replicate";

import type { AdCreative, AdCreativeTexts, AdFormattedBrief, AdStrategy } from "@/lib/ad-types";
import { getOpenAI } from "@/lib/openai";
import { isStudioStyleKey, studioStyles, type CreativeLanguage, type StudioStyleKey } from "@/lib/studio-styles";

const FALLBACK_IMAGE = "https://placehold.co/1080x1350/0A0A0A/EDED2D?text=Image+Generation+Failed";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const languageLabels: Record<CreativeLanguage, string> = {
  ru: "Russian",
  en: "English",
  de: "German",
  sk: "Slovak",
  es: "Spanish",
};

export async function generateImage(prompt: string): Promise<string> {
  return generateImageWithFlux(prompt);
}

export async function generateImageWithFlux(prompt: string): Promise<string> {
  try {
    if (!process.env.REPLICATE_API_TOKEN?.trim()) {
      throw new Error("REPLICATE_API_TOKEN is not set");
    }

    const output = await replicate.run("black-forest-labs/flux-schnell", {
      input: {
        prompt,
        aspect_ratio: "4:5",
        output_format: "webp",
        output_quality: 90,
      },
    });

    const url = firstOutputUrl(output);
    if (!url) throw new Error("Replicate вернул пустой output.");
    return url;
  } catch (error) {
    console.error("[generateImageWithFlux]", error);
    return FALLBACK_IMAGE;
  }
}

function firstOutputUrl(output: unknown): string | null {
  const items = Array.isArray(output) ? output : output != null ? [output] : [];
  for (const item of items) {
    if (typeof item === "string" && /^https?:\/\//i.test(item)) return item;
    if (item && typeof item === "object") {
      if ("url" in item && typeof (item as { url: unknown }).url === "function") {
        try {
          const value = (item as { url: () => unknown }).url();
          if (value instanceof URL) return value.href;
          if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
        } catch {
          // Fall through to toString / href checks.
        }
      }
      if (typeof (item as { href?: unknown }).href === "string") {
        const href = (item as { href: string }).href;
        if (/^https?:\/\//i.test(href)) return href;
      }
      const asString = String(item);
      if (/^https?:\/\//i.test(asString)) return asString;
    }
  }
  return null;
}

export function publicCreativesError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    if (/OPENAI_API_KEY/i.test(error.message)) return "Не задан ключ OpenAI.";
    if (/REPLICATE_API_TOKEN/i.test(error.message)) return "Не задан ключ Replicate.";
    if (/creatives_data/i.test(error.message)) {
      return "В базе нет колонки creatives_data. Выполните миграцию в Supabase.";
    }
    return error.message;
  }
  return "Не удалось сгенерировать креативы.";
}

export async function buildCreatives(input: {
  count: number;
  language: CreativeLanguage;
  styleId: StudioStyleKey;
  brief: AdFormattedBrief | null;
  strategy: AdStrategy | null;
}): Promise<AdCreative[]> {
  const style = studioStyles.find((item) => item.key === input.styleId);
  if (!style) throw new Error("Неизвестный визуальный стиль.");

  const tasks = Array.from({ length: input.count }, (_, index) =>
    composeCreative({
      index,
      language: input.language,
      styleId: input.styleId,
      masterPrompt: style.masterPrompt,
      brief: input.brief,
      strategy: input.strategy,
    }),
  );

  return Promise.all(tasks);
}

async function composeCreative(input: {
  index: number;
  language: CreativeLanguage;
  styleId: StudioStyleKey;
  masterPrompt: string;
  brief: AdFormattedBrief | null;
  strategy: AdStrategy | null;
}): Promise<AdCreative> {
  const art = await directArt({
    index: input.index,
    language: input.language,
    masterPrompt: input.masterPrompt,
    brief: input.brief,
    strategy: input.strategy,
  });
  const imageUrl = await generateImage(art.image_prompt);
  return {
    id: randomUUID(),
    image_url: imageUrl,
    prompt: art.image_prompt,
    texts: {
      headline: art.headline,
      subheadline: art.subheadline,
      benefit: art.benefit,
      cta: art.cta,
    },
    style_id: input.styleId,
  };
}

async function directArt(input: {
  index: number;
  language: CreativeLanguage;
  masterPrompt: string;
  brief: AdFormattedBrief | null;
  strategy: AdStrategy | null;
}): Promise<AdCreativeTexts & { image_prompt: string }> {
  const language = languageLabels[input.language] ?? "English";
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    temperature: 0.85,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `Роль: ты — арт-директор performance-креативов для Meta Ads.
Выбери уникальную комбинацию текстов для одного креатива и собери финальный image prompt на английском.
ГЛОБАЛЬНОЕ ПРАВИЛО ВАЛЮТЫ: только $ / USD или €. Запрещены рубли (руб, ₽, RUB) и реалии СНГ.
Тексты на креативе (headline/subheadline/benefit/cta) — на языке: ${language}.
image_prompt — строго на английском, готов к Flux.1.

CRITICAL TYPOGRAPHY RULE: Flux.1 is generating the images. You must explicitly include the exact marketing text inside the image prompt using quotes.
- Do NOT generate images without text.
- Use the exact short headlines or offers from the brief.
- Format example: A high-end editorial photo of a modern living room, with bold, minimalist typography overlaid reading "RENOVATION IN 5 DAYS".
- Keep the text short (1-5 words maximum). Flux renders short text perfectly.
- Ensure the prompt is ALWAYS written in English, even if the target audience is different, but the text inside the quotes should be the exact text needed for the creative.

Верни JSON:
{
  "headline": "краткий заголовок (1-5 слов)",
  "subheadline": "подзаголовок",
  "benefit": "одна конкретная выгода с цифрой если уместно",
  "cta": "короткий CTA",
  "image_prompt": "English visual prompt with quoted on-image text, layout, lighting, typography placement, subject"
}`,
      },
      {
        role: "user",
        content: JSON.stringify({
          creative_index: input.index + 1,
          style_master_prompt: input.masterPrompt,
          formatted_brief: input.brief,
          strategy: input.strategy
            ? {
                insight: input.strategy.strategy.target_audience_insight,
                offer_angle: input.strategy.strategy.core_offer_angle,
                hook: input.strategy.strategy.hook_concept,
                headlines: input.strategy.creatives.headlines,
                subheadlines: input.strategy.creatives.subheadlines,
                benefits: input.strategy.creatives.benefits,
                buttons: input.strategy.creatives.buttons,
              }
            : null,
          instruction:
            "Make this creative visually and verbally distinct from other variants in the same batch. Prefer concrete numbers over soft adjectives.",
        }),
      },
    ],
  });

  return parseArtDirection(completion.choices[0]?.message?.content ?? "");
}

function parseArtDirection(content: string): AdCreativeTexts & { image_prompt: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Арт-директор вернул невалидный JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Арт-директор вернул пустой ответ.");
  const row = parsed as Record<string, unknown>;
  const headline = readText(row.headline);
  const subheadline = readText(row.subheadline);
  const benefit = readText(row.benefit);
  const cta = readText(row.cta);
  const imagePrompt = readText(row.image_prompt);
  if (!headline || !imagePrompt) throw new Error("Арт-директор не собрал тексты или prompt.");
  return {
    headline,
    subheadline: subheadline || headline,
    benefit: benefit || subheadline || headline,
    cta: cta || "Learn more",
    image_prompt: imagePrompt,
  };
}

function readText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function parseFormattedBriefRow(value: unknown): AdFormattedBrief | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const product = readText(row.product);
  const audience = readText(row.audience);
  const offer = readText(row.offer);
  if (!product || !audience || !offer) return null;
  return { product, audience, offer };
}

export function resolveStyleId(value: string): StudioStyleKey | null {
  return isStudioStyleKey(value) ? value : null;
}
