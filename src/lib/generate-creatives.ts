import "server-only";

import { randomUUID } from "crypto";
import Replicate from "replicate";

import { accentColorForPrompt, DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import type { AdCreative, AdCreativeTexts, AdFormattedBrief, AdStrategy } from "@/lib/ad-types";
import { limitBadgeWords } from "@/lib/badge-copy";
import { getOpenAI } from "@/lib/openai";
import {
  isDualImageStyle,
  isSplitActionStyle,
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
      // Explicit random seed so batch variants never share a fixed seed.
      seed: Math.floor(Math.random() * 2_147_483_647),
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
  accentColor?: string | null;
}): Promise<AdCreative[]> {
  const style = studioStyles.find((item) => item.key === input.styleId);
  if (!style) throw new Error("Неизвестный визуальный стиль.");
  const accentLabel = accentColorForPrompt(input.accentColor);
  const accentHex = resolveAccentHex(input.accentColor, DEFAULT_ACCENT_COLOR);

  const tasks = Array.from({ length: input.count }, (_, index) =>
    composeCreative({
      index,
      language: input.language,
      styleId: input.styleId,
      masterPrompt: style.masterPrompt,
      brief: input.brief,
      strategy: input.strategy,
      accentLabel,
      accentHex,
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
  accentLabel: string;
  accentHex: string;
}): Promise<AdCreative> {
  const dual = isDualImageStyle(input.styleId);
  const sampled = sampleStrategyCopy(input.strategy);
  const art = await directArt({
    index: input.index,
    language: input.language,
    masterPrompt: input.masterPrompt,
    brief: input.brief,
    strategy: input.strategy,
    dual,
    styleId: input.styleId,
    accentLabel: input.accentLabel,
    accentHex: input.accentHex,
    sampled,
  });

  if (dual) {
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
        badge: art.badge,
      },
      style_id: input.styleId,
      accent_color: input.accentHex,
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
      badge: art.badge,
    },
    style_id: input.styleId,
    accent_color: input.accentHex,
  };
}

type ArtDirection = AdCreativeTexts & {
  image_prompt: string;
  prompt_before: string;
  prompt_after: string;
};

type SampledCopy = {
  headline: string | null;
  subheadline: string | null;
  bullets: string[];
  button: string | null;
};

function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)];
}

function pickRandomSubset<T>(items: T[], count: number): T[] {
  if (items.length === 0) return [];
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = shuffled[i]!;
    shuffled[i] = shuffled[j]!;
    shuffled[j] = tmp;
  }
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

function sampleStrategyCopy(strategy: AdStrategy | null): SampledCopy {
  if (!strategy) {
    return { headline: null, subheadline: null, bullets: [], button: null };
  }
  const headlines = strategy.creatives.headlines.filter((item) => item.trim());
  const subheadlines = strategy.creatives.subheadlines.filter((item) => item.trim());
  const benefits = strategy.creatives.benefits.filter((item) => item.trim());
  const buttons = strategy.creatives.buttons.filter((item) => item.trim());
  return {
    headline: pickRandom(headlines) ?? null,
    subheadline: pickRandom(subheadlines) ?? null,
    bullets: pickRandomSubset(benefits, Math.min(4, Math.max(2, benefits.length || 0))),
    button: pickRandom(buttons) ?? null,
  };
}

async function directArt(input: {
  index: number;
  language: CreativeLanguage;
  masterPrompt: string;
  brief: AdFormattedBrief | null;
  strategy: AdStrategy | null;
  dual: boolean;
  styleId: StudioStyleKey;
  accentLabel: string;
  accentHex: string;
  sampled: SampledCopy;
}): Promise<ArtDirection> {
  const language = languageLabels[input.language] ?? "English";
  const accentRule = `Акцентный цвет рекламного макета: ${input.accentLabel} (HEX ${input.accentHex}). При генерации промпта для Flux добавляй тонкие отсветы, освещение или детали фона в этом оттенке, чтобы картинка гармонировала с версткой.`;
  const visualDiversityRule =
    "Для каждого креатива генерируй АБСОЛЮТНО НОВОЕ, уникальное визуальное описание (меняй ракурсы, освещение, атмосферу, композицию), даже если тексты повторяются. Визуал должен быть разнообразным.";
  const badgeRule = `Поле \`badge\` — это мощный маркетинговый триггер. Возьми текст из переданного поля Спецпредложения (hook / strategy.hook_concept) и выжми из него самую суть. ЛИМИТ: от 1 до 6 слов. Примеры идеального бейджа: 'ВОЗЬМЕМ ТОЛЬКО 2 ПРОЕКТА В ЭТОМ МЕСЯЦЕ', 'СКИДКА 20% ДО ПЯТНИЦЫ', 'БЕСПЛАТНЫЙ РАСЧЕТ И КОНСУЛЬТАЦИЯ В ПОДАРОК'. Категорически запрещено вставлять туда длинные абзацы и предложения!`;
  const styleLabel = isSplitVsStyle(input.styleId)
    ? "стиль 1 — сплит До/После (VS)"
    : isSplitActionStyle(input.styleId)
      ? "стиль 2 — двусторонний сплит с акцентом"
      : "стандартный стиль";

  const systemPrompt = input.dual
    ? `CRITICAL RULE: DO NOT GENERATE ANY TEXT, LETTERS, NUMBERS, OR WORDS ON THE IMAGE. GENERATE ONLY A CLEAN BACKGROUND PHOTOGRAPH. ANY TEXT WILL RUIN THE IMAGE.

Роль: ты — арт-директор performance-креативов для Meta Ads (${styleLabel}).
Собери тексты для React-шаблона и ДВА независимых Flux-промпта фона.
ГЛОБАЛЬНОЕ ПРАВИЛО ВАЛЮТЫ: только $ / USD или €. Запрещены рубли (руб, ₽, RUB) и реалии СНГ.
Тексты (headline/subheadline/benefit/cta/badge) — на языке: ${language}. Они пойдут в HTML-шаблон, НЕ на картинку.
Если в sampled_copy уже выбран headline/subheadline/bullets/button — используй их как основу (можно слегка отполировать формулировку, но смысл сохрани).
${badgeRule}
${accentRule}
${visualDiversityRule}

CRITICAL IMAGE RULE:
- NEVER put text, letters, numbers, logos with words, watermarks, or captions in either Flux prompt.
- prompt_before: мрачный / холодный / проблемный кадр «до» (pain state).
- prompt_after: светлый / тёплый / успешный кадр «после» (без текста на фото).
- Both prompts MUST be English, vertical 4:5 photographic backgrounds only.
- Weave subtle accent-color light / reflections (${input.accentHex}) into the scene — not text, not UI chrome.

Верни JSON:
{
  "headline": "краткий заголовок (1-5 слов)",
  "subheadline": "подзаголовок",
  "benefit": "выгода, строго до 5 слов (или склейка первого буллита)",
  "cta": "короткий CTA",
  "badge": "триггер 1-6 слов из hook",
  "prompt_before": "English Flux prompt — bleak problem-state photo, no text",
  "prompt_after": "English Flux prompt — bright success-state photo, no text"
}`
    : `CRITICAL RULE: DO NOT GENERATE ANY TEXT, LETTERS, NUMBERS, OR WORDS ON THE IMAGE. GENERATE ONLY A CLEAN BACKGROUND PHOTOGRAPH. ANY TEXT WILL RUIN THE IMAGE.

Роль: ты — арт-директор performance-креативов для Meta Ads.
Выбери тексты для React-шаблона и собери финальный image prompt на английском.
ГЛОБАЛЬНОЕ ПРАВИЛО ВАЛЮТЫ: только $ / USD или €. Запрещены рубли (руб, ₽, RUB) и реалии СНГ.
Тексты на креативе (headline/subheadline/benefit/cta/badge) — на языке: ${language}. Эти тексты пойдут в React-шаблон, НЕ на картинку.
Если в sampled_copy уже выбран headline/subheadline/bullets/button — используй их как основу.
${badgeRule}
image_prompt — строго на английском, готов к Flux.1: только чистая фотография фона, без типографики.
${accentRule}
${visualDiversityRule}

CRITICAL IMAGE RULE (Flux background only):
- NEVER put text, letters, numbers, logos with words, watermarks, or captions in image_prompt.
- Describe only subject, lighting, composition, mood, and camera language.
- image_prompt MUST be English. Marketing copy lives only in headline/subheadline/benefit/cta/badge fields.
- Add subtle accent-color lighting / reflections (${input.accentHex}) so the photo matches the layout accent.

Верни JSON:
{
  "headline": "краткий заголовок (1-5 слов)",
  "subheadline": "подзаголовок",
  "benefit": "выгода, строго до 5 слов",
  "cta": "короткий CTA",
  "badge": "триггер 1-6 слов из hook",
  "image_prompt": "English visual prompt for a clean background photograph only — no text, letters, numbers, or words"
}`;

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    temperature: 0.95,
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
          style_id: isSplitVsStyle(input.styleId) ? "1" : isSplitActionStyle(input.styleId) ? "2" : input.styleId,
          style_master_prompt: input.masterPrompt,
          formatted_brief: input.brief,
          sampled_copy: input.sampled,
          strategy: input.strategy
            ? {
                insight: input.strategy.strategy.target_audience_insight,
                offer_angle: input.strategy.strategy.core_offer_angle,
                hook: input.strategy.strategy.hook_concept,
              }
            : null,
          key_advantages: input.brief?.key_advantages ?? null,
          accent_color: input.accentLabel,
          accent_hex: input.accentHex,
          instruction: input.dual
            ? "Use sampled_copy texts. Return two contrasting Flux backgrounds (prompt_before vs prompt_after). Absolutely unique visual description for this creative_index. No on-image text."
            : "Use sampled_copy texts. Absolutely unique visual description for this creative_index even if copy repeats. Reflect accent color in lighting.",
        }),
      },
    ],
  });

  const hook = input.strategy?.strategy.hook_concept?.trim() ?? "";
  const parsed = parseArtDirection(completion.choices[0]?.message?.content ?? "", input.dual, hook);
  return {
    ...parsed,
    headline: input.sampled.headline?.trim() || parsed.headline,
    subheadline: input.sampled.subheadline?.trim() || parsed.subheadline,
    benefit: input.sampled.bullets[0]?.trim() || parsed.benefit,
    cta: input.sampled.button?.trim() || parsed.cta,
    badge: parsed.badge || limitBadgeWords(hook) || undefined,
  };
}

function parseArtDirection(content: string, dual: boolean, hookFallback: string): ArtDirection {
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
  const badge = limitBadgeWords(readText(row.badge) || hookFallback);
  const imagePrompt = readText(row.image_prompt);
  const promptBefore =
    readText(row.prompt_before) || readText(row.flux_prompt_before) || (dual ? "" : imagePrompt);
  const promptAfter =
    readText(row.prompt_after) || readText(row.flux_prompt_after) || (dual ? "" : imagePrompt);

  if (!headline) throw new Error("Арт-директор не собрал тексты.");
  if (dual) {
    if (!promptBefore || !promptAfter) {
      throw new Error("Арт-директор не собрал prompt_before / prompt_after для dual-split стиля.");
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
    badge: badge || undefined,
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
