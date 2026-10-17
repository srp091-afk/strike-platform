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

const FLUX_SCHNELL = "black-forest-labs/flux-schnell";

export async function generateImage(prompt: string): Promise<string> {
  return generateImageWithFlux(prompt);
}

export async function generateImageWithFlux(prompt: string): Promise<string> {
  try {
    if (!process.env.REPLICATE_API_TOKEN?.trim()) {
      throw new Error("REPLICATE_API_TOKEN is not set");
    }

    // Official flux-schnell schema: prompt, aspect_ratio, output_format, output_quality, …
    // https://replicate.com/black-forest-labs/flux-schnell/api
    const input = {
      prompt,
      aspect_ratio: "4:5",
      output_format: "webp" as const,
      output_quality: 90,
      num_outputs: 1,
    };

    console.log("[generateImageWithFlux] request", {
      model: FLUX_SCHNELL,
      input,
      authPrefix: process.env.REPLICATE_API_TOKEN.slice(0, 5),
    });

    // Do NOT use replicate.run() in block mode here: replicate@1.4.0 treats any
    // status !== "starting" as done, so a Prefer:wait timeout with
    // status:"processing" + output:null returns null without throwing.
    let prediction = await replicate.predictions.create({
      model: FLUX_SCHNELL,
      input,
    });

    console.log("[generateImageWithFlux] initial prediction", summarizePrediction(prediction));

    if (!isTerminalStatus(prediction.status)) {
      prediction = await replicate.wait(prediction, { interval: 1000 });
      console.log("[generateImageWithFlux] after wait", summarizePrediction(prediction));
    }

    if (prediction.status === "failed") {
      throw new Error(`Prediction failed: ${stringifyUnknown(prediction.error)}`);
    }
    if (prediction.status === "canceled") {
      throw new Error("Prediction canceled before output was ready.");
    }
    if (prediction.status !== "succeeded") {
      throw new Error(
        `Prediction stuck in status=${prediction.status}; output=${stringifyUnknown(prediction.output)}`,
      );
    }

    const output = prediction.output;
    console.log("[generateImageWithFlux] succeeded output", {
      output,
      outputType: describeOutputType(output),
      logsTail: typeof prediction.logs === "string" ? prediction.logs.slice(-800) : prediction.logs,
    });

    const items = Array.isArray(output) ? output : output != null ? [output] : [];
    if (items.length === 0) {
      throw new Error(
        `Replicate вернул пустой output после succeeded. Возможно NSFW/safety. logs=${String(prediction.logs ?? "").slice(0, 500)}`,
      );
    }

    const imageUrl = resolveOutputUrl(items[0]);
    if (!imageUrl) {
      throw new Error(`Не удалось извлечь URL из output[0]=${stringifyUnknown(items[0])}`);
    }
    return imageUrl;
  } catch (error) {
    console.error("[generateImageWithFlux]", error);
    return FALLBACK_IMAGE;
  }
}

function isTerminalStatus(status: unknown) {
  return status === "succeeded" || status === "failed" || status === "canceled";
}

function summarizePrediction(prediction: unknown) {
  if (!prediction || typeof prediction !== "object") {
    return { rawType: typeof prediction, raw: prediction };
  }
  const row = prediction as Record<string, unknown>;
  return {
    id: row.id,
    status: row.status,
    model: row.model,
    version: row.version,
    error: row.error,
    output: row.output,
    outputType: describeOutputType(row.output),
    logs: typeof row.logs === "string" ? row.logs.slice(0, 2000) : row.logs,
    metrics: row.metrics,
    urls: row.urls,
    created_at: row.created_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    data_removed: row.data_removed,
  };
}

function describeOutputType(output: unknown) {
  if (output === null) return "null";
  if (output === undefined) return "undefined";
  if (Array.isArray(output)) return `array(length=${output.length})`;
  return typeof output;
}

function stringifyUnknown(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveOutputUrl(item: unknown): string | null {
  if (typeof item === "string") {
    const value = item.trim();
    return /^https?:\/\//i.test(value) ? value : null;
  }
  if (item && typeof item === "object") {
    if ("url" in item && typeof (item as { url: unknown }).url === "function") {
      try {
        const value = (item as { url: () => unknown }).url();
        if (value instanceof URL) return value.href;
        if (typeof value === "string" && /^https?:\/\//i.test(value.trim())) return value.trim();
      } catch {
        // Fall through.
      }
    }
    const asString = String(item).trim();
    if (/^https?:\/\//i.test(asString)) return asString;
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
Опирайся на formatted_brief.key_advantages при выборе benefit: короткая ударная выгода СТРОГО НЕ БОЛЕЕ 5 слов, без деепричастных оборотов.

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
  "benefit": "выгода из key_advantages, строго до 5 слов",
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
          key_advantages: input.brief?.key_advantages ?? null,
          instruction:
            "Make this creative visually and verbally distinct from other variants in the same batch. Prefer concrete numbers over soft adjectives. Base benefit bullets on key_advantages; max 5 words.",
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
  const key_advantages = readText(row.key_advantages);
  const offer = readText(row.offer);
  if (!product || !audience || !offer) return null;
  return { product, audience, key_advantages, offer };
}

export function resolveStyleId(value: string): StudioStyleKey | null {
  return isStudioStyleKey(value) ? value : null;
}
