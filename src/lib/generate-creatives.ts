import "server-only";

import { randomUUID } from "crypto";
import Replicate from "replicate";

import type { AdCreative, AdCreativeTexts, AdFormattedBrief, AdStrategy } from "@/lib/ad-types";
import { getOpenAI } from "@/lib/openai";
import {
  isSplitVsStyle,
  resolveStudioStyleKey,
  studioStyles,
  type CreativeLanguage,
  type StudioStyleKey,
} from "@/lib/studio-styles";

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

const FLUX_NO_TEXT_PREFIX =
  "CRITICAL RULE: DO NOT GENERATE ANY TEXT, LETTERS, NUMBERS, OR WORDS ON THE IMAGE. GENERATE ONLY A CLEAN BACKGROUND PHOTOGRAPH. ANY TEXT WILL RUIN THE IMAGE. ";

export async function generateImage(prompt: string): Promise<string> {
  return generateImageWithFlux(prompt);
}

export async function generateImageWithFlux(prompt: string): Promise<string> {
  try {
    if (!process.env.REPLICATE_API_TOKEN?.trim()) {
      throw new Error("REPLICATE_API_TOKEN is not set");
    }

    const safePrompt = prompt.startsWith("CRITICAL RULE:") ? prompt : `${FLUX_NO_TEXT_PREFIX}${prompt}`;

    // Official flux-schnell schema: prompt, aspect_ratio, output_format, output_quality, …
    // https://replicate.com/black-forest-labs/flux-schnell/api
    const input = {
      prompt: safePrompt,
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
  const split = isSplitVsStyle(input.styleId);
  const art = await directArt({
    index: input.index,
    language: input.language,
    masterPrompt: input.masterPrompt,
    brief: input.brief,
    strategy: input.strategy,
    split,
  });

  if (split) {
    const [beforeUrl, afterUrl] = await Promise.all([
      generateImage(art.prompt_before),
      generateImage(art.prompt_after),
    ]);
    const image_urls = [beforeUrl, afterUrl].filter((url) => Boolean(url.trim()));
    return {
      id: randomUUID(),
      image_url: image_urls[0] ?? beforeUrl,
      image_urls: image_urls.length >= 2 ? image_urls.slice(0, 2) : [beforeUrl, afterUrl],
      prompt: art.prompt_before,
      prompts: { before: art.prompt_before, after: art.prompt_after },
      texts: {
        headline: art.headline,
        subheadline: art.subheadline,
        benefit: art.benefit,
        cta: art.cta,
      },
      style_id: input.styleId,
    };
  }

  const imageUrl = await generateImage(art.image_prompt);
  return {
    id: randomUUID(),
    image_url: imageUrl,
    image_urls: [imageUrl],
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

type ArtDirection = AdCreativeTexts & {
  image_prompt: string;
  prompt_before: string;
  prompt_after: string;
};

async function directArt(input: {
  index: number;
  language: CreativeLanguage;
  masterPrompt: string;
  brief: AdFormattedBrief | null;
  strategy: AdStrategy | null;
  split: boolean;
}): Promise<ArtDirection> {
  const language = languageLabels[input.language] ?? "English";
  const systemPrompt = input.split
    ? `CRITICAL RULE: DO NOT GENERATE ANY TEXT, LETTERS, NUMBERS, OR WORDS ON THE IMAGE. GENERATE ONLY A CLEAN BACKGROUND PHOTOGRAPH. ANY TEXT WILL RUIN THE IMAGE.

Роль: ты — арт-директор performance-креативов для Meta Ads (стиль 1 — сплит До/После).
Выбери тексты для React-шаблона и ДВА независимых Flux-промпта фона.
ГЛОБАЛЬНОЕ ПРАВИЛО ВАЛЮТЫ: только $ / USD или €. Запрещены рубли (руб, ₽, RUB) и реалии СНГ.
Тексты (headline/subheadline/benefit/cta) — на языке: ${language}. Они пойдут в HTML-шаблон, НЕ на картинку.
Опирайся на formatted_brief.key_advantages при выборе benefit: короткая ударная выгода СТРОГО НЕ БОЛЕЕ 5 слов.

CRITICAL IMAGE RULE:
- NEVER put text, letters, numbers, logos with words, watermarks, or captions in either Flux prompt.
- prompt_before: мрачный / холодный / проблемный кадр «до» продукта (pain state).
- prompt_after: светлый / тёплый / успешный кадр «после» с ощущением решения (без текста на фото).
- Both prompts MUST be English, vertical 4:5 photographic backgrounds only.

Верни JSON:
{
  "headline": "краткий заголовок (1-5 слов)",
  "subheadline": "подзаголовок",
  "benefit": "выгода из key_advantages, строго до 5 слов",
  "cta": "короткий CTA",
  "prompt_before": "English Flux prompt — bleak problem-state photo, no text",
  "prompt_after": "English Flux prompt — bright success-state photo, no text"
}`
    : `CRITICAL RULE: DO NOT GENERATE ANY TEXT, LETTERS, NUMBERS, OR WORDS ON THE IMAGE. GENERATE ONLY A CLEAN BACKGROUND PHOTOGRAPH. ANY TEXT WILL RUIN THE IMAGE.

Роль: ты — арт-директор performance-креативов для Meta Ads.
Выбери уникальную комбинацию текстов для одного креатива и собери финальный image prompt на английском.
ГЛОБАЛЬНОЕ ПРАВИЛО ВАЛЮТЫ: только $ / USD или €. Запрещены рубли (руб, ₽, RUB) и реалии СНГ.
Тексты на креативе (headline/subheadline/benefit/cta) — на языке: ${language}. Эти тексты пойдут в React-шаблон, НЕ на картинку.
image_prompt — строго на английском, готов к Flux.1: только чистая фотография фона, без типографики.
Опирайся на formatted_brief.key_advantages при выборе benefit: короткая ударная выгода СТРОГО НЕ БОЛЕЕ 5 слов, без деепричастных оборотов.

CRITICAL IMAGE RULE (Flux background only):
- NEVER put text, letters, numbers, logos with words, watermarks, or captions in image_prompt.
- Describe only subject, lighting, composition, mood, and camera language.
- Format example: A high-end editorial photograph of a modern living room at dusk, soft volumetric light, 4:5 vertical crop, no typography, no signage.
- image_prompt MUST be English. Marketing copy lives only in headline/subheadline/benefit/cta fields.

Верни JSON:
{
  "headline": "краткий заголовок (1-5 слов)",
  "subheadline": "подзаголовок",
  "benefit": "выгода из key_advantages, строго до 5 слов",
  "cta": "короткий CTA",
  "image_prompt": "English visual prompt for a clean background photograph only — no text, letters, numbers, or words"
}`;

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    temperature: 0.85,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: systemPrompt,
      },
      {
        role: "user",
        content: JSON.stringify({
          creative_index: input.index + 1,
          style_id: input.split ? "1" : undefined,
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
          instruction: input.split
            ? "Return two contrasting Flux backgrounds (prompt_before vs prompt_after). No on-image text. Texts go only in headline/subheadline/benefit/cta."
            : "Make this creative visually and verbally distinct from other variants in the same batch. Prefer concrete numbers over soft adjectives. Base benefit bullets on key_advantages; max 5 words.",
        }),
      },
    ],
  });

  return parseArtDirection(completion.choices[0]?.message?.content ?? "", input.split);
}

function parseArtDirection(content: string, split: boolean): ArtDirection {
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
  const promptBefore =
    readText(row.prompt_before) || readText(row.flux_prompt_before) || (split ? "" : imagePrompt);
  const promptAfter =
    readText(row.prompt_after) || readText(row.flux_prompt_after) || (split ? "" : imagePrompt);

  if (!headline) throw new Error("Арт-директор не собрал тексты.");
  if (split) {
    if (!promptBefore || !promptAfter) {
      throw new Error("Арт-директор не собрал prompt_before / prompt_after для сплита До/После.");
    }
  } else if (!imagePrompt && !promptBefore) {
    throw new Error("Арт-директор не собрал image_prompt.");
  }

  const single = imagePrompt || promptBefore;
  return {
    headline,
    subheadline: subheadline || headline,
    benefit: benefit || subheadline || headline,
    cta: cta || "Learn more",
    image_prompt: single,
    prompt_before: promptBefore || single,
    prompt_after: promptAfter || single,
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
  return resolveStudioStyleKey(value);
}
