import "server-only";

import { randomUUID } from "crypto";
import Replicate from "replicate";

import { accentColorForPrompt, DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import type { AdCreative, AdCreativeTexts, AdFormattedBrief, AdStrategy } from "@/lib/ad-types";
import { limitBadgeWords } from "@/lib/badge-copy";
import { creativePlaceholderSize, DEFAULT_CREATIVE_FORMAT, resolveCreativeFormat } from "@/lib/creative-format";
import type { CreativeFormat } from "@/types/creatives";
import { persistCreativeImage } from "@/lib/creative-storage";
import { getOpenAI } from "@/lib/openai";
import {
  isDualImageStyle,
  isEditorialBlockStyle,
  isPremiumDarkStyle,
  isSideFadeStyle,
  isSplitActionStyle,
  isSplitVsStyle,
  resolveStudioStyleKey,
  studioStyleNumericId,
  studioStyles,
  templateIdForStyleKey,
  type CreativeLanguage,
  type StudioStyleKey,
} from "@/lib/studio-styles";

function fallbackImage(format: CreativeFormat): string {
  return `https://placehold.co/${creativePlaceholderSize(format)}/0A0A0A/EDED2D?text=Image+Generation+Failed`;
}

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

export async function generateImage(prompt: string, format: CreativeFormat = DEFAULT_CREATIVE_FORMAT): Promise<string> {
  return generateImageWithFlux(prompt, format);
}

export async function generateImageWithFlux(prompt: string, format: CreativeFormat = DEFAULT_CREATIVE_FORMAT): Promise<string> {
  try {
    if (!process.env.REPLICATE_API_TOKEN?.trim()) {
      throw new Error("REPLICATE_API_TOKEN is not set");
    }

    const safePrompt = prompt.startsWith("CRITICAL RULE:") ? prompt : `${FLUX_NO_TEXT_PREFIX}${prompt}`;

    // Official flux-schnell schema: prompt, aspect_ratio, output_format, output_quality, …
    // https://replicate.com/black-forest-labs/flux-schnell/api
    const input = {
      prompt: safePrompt,
      // Feed 4:5 (1856×2304 class) or stories 9:16 (1080×1920 class).
      aspect_ratio: format,
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
    // Replicate delivery URLs expire (~24h): re-upload to Supabase Storage
    // (`creatives` bucket) and persist only the permanent public URL.
    // Split styles call this via Promise.all, so before/after persist in parallel.
    return persistCreativeImage(imageUrl);
  } catch (error) {
    console.error("[generateImageWithFlux]", error);
    return fallbackImage(format);
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

export interface CreativeStylePlan {
  styleId: StudioStyleKey;
  /** `creative_templates.system_prompt`; falls back to the built-in master prompt. */
  masterPrompt?: string | null;
  /** Per-creative format stamped in the pack (mixed 4:5 / 9:16 packs). */
  format?: CreativeFormat;
}

export async function buildCreatives(input: {
  /** Legacy single-style mode: repeat `styleId` `count` times. */
  count?: number;
  styleId?: StudioStyleKey;
  /** Style pack: one entry per generated creative (its own style + prompt). */
  styles?: CreativeStylePlan[];
  language: CreativeLanguage;
  brief: AdFormattedBrief | null;
  strategy: AdStrategy | null;
  accentColor?: string | null;
  /** Feed 4:5 vs stories 9:16 — Flux aspect_ratio + stamped on creatives. */
  aspectRatio?: CreativeFormat | string | null;
}): Promise<AdCreative[]> {
  const format = resolveCreativeFormat(input.aspectRatio);
  const plan: CreativeStylePlan[] =
    input.styles && input.styles.length > 0
      ? input.styles
      : Array.from({ length: input.count ?? 0 }, () => ({ styleId: input.styleId as StudioStyleKey }));
  if (plan.length === 0) throw new Error("Не выбран ни один визуальный стиль.");

  const accentLabel = accentColorForPrompt(input.accentColor);
  const accentHex = resolveAccentHex(input.accentColor, DEFAULT_ACCENT_COLOR);

  // Each pack entry is generated with ITS style and ITS DB system_prompt;
  // composeCreative stamps the matching template UUID into creative.style_id.
  const tasks = plan.map((entry, index) => {
    const style = studioStyles.find((item) => item.key === entry.styleId);
    if (!style) throw new Error("Неизвестный визуальный стиль.");
    return composeCreative({
      index,
      language: input.language,
      styleId: entry.styleId,
      masterPrompt: entry.masterPrompt?.trim() ? entry.masterPrompt : style.masterPrompt,
      brief: input.brief,
      strategy: input.strategy,
      accentLabel,
      accentHex,
      // Entry format wins; the batch-level aspectRatio is only a default.
      format: entry.format ? resolveCreativeFormat(entry.format) : format,
    });
  });

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
  format: CreativeFormat;
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
      generateImage(art.prompt_before, input.format),
      generateImage(art.prompt_after, input.format),
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
      style_id: templateIdForStyleKey(input.styleId),
      accent_color: input.accentHex,
      aspect_ratio: input.format,
    };
  }

  // Single-image styles (3, 4, 5): exactly one Flux call, images = [url].
  const imageUrl = await generateImage(art.image_prompt, input.format);
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
    style_id: templateIdForStyleKey(input.styleId),
    accent_color: input.accentHex,
    aspect_ratio: input.format,
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
  badge: string | null;
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
    return { headline: null, subheadline: null, bullets: [], button: null, badge: null };
  }
  const headlines = strategy.creatives.headlines.filter((item) => item.trim());
  const subheadlines = strategy.creatives.subheadlines.filter((item) => item.trim());
  const benefits = strategy.creatives.benefits.filter((item) => item.trim());
  const buttons = strategy.creatives.buttons.filter((item) => item.trim());
  const badges = (strategy.creatives.badges ?? []).filter((item) => item.trim());
  return {
    headline: pickRandom(headlines) ?? null,
    subheadline: pickRandom(subheadlines) ?? null,
    bullets: pickRandomSubset(benefits, Math.min(4, Math.max(2, benefits.length || 0))),
    button: pickRandom(buttons) ?? null,
    // User-edited badges (панель «БЕЙДЖИ (УТП / ТРИГГЕРЫ)») win at generation.
    badge: pickRandom(badges) ?? null,
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
  // The client's niche (brief product) is the mandatory image subject —
  // split "before/after" frames must show THIS business, not a generic scene.
  const niche = input.brief?.product?.trim() || "the advertised product or service";
  const nicheSplitRule = isSplitVsStyle(input.styleId)
    ? `\n\nCONTEXTUAL SPLIT RULE (style 1, До/После): build both prompts around the client's niche as the subject, following this exact frame: "Split screen before and after shot. Subject: ${niche}. Left side: terrible, bad quality, messy version of ${niche}. Right side: perfect, premium, clean, professional version of ${niche}. Cinematic lighting, highly detailed." prompt_before = the LEFT (terrible/messy) version, prompt_after = the RIGHT (perfect/premium) version. Same subject, same space/product, only the state changes. NEVER substitute a generic interior/object that is unrelated to ${niche}.`
    : isSplitActionStyle(input.styleId)
      ? `\n\nCONTEXTUAL SPLIT RULE (style 2, Split Action): build both prompts around the client's niche as the subject, following this exact frame: "Split screen before and after shot of ${niche}. Left side is BEFORE: black and white grayscale, messy, bad quality. Right side is AFTER: full color, premium, perfect. CRITICAL: NO TEXT, NO LETTERS, NO WORDS, NO FONTS anywhere in the image. Pure photography only." prompt_before = the LEFT (grayscale, messy, bad-quality) version, prompt_after = the RIGHT (full-color, premium, perfect) version. Same subject, same space/product, only the state changes. NEVER substitute a generic interior/object that is unrelated to ${niche}.`
      : "";
  const nicheSingleRule = isPremiumDarkStyle(input.styleId)
    ? `\n\nCONTEXTUAL PREMIUM RULE (style 3, Premium Dark): build flux_prompt around the client's niche as the hero subject, following this exact frame: "Premium, cinematic, dark moody photography of ${niche}. Highly detailed, 8k, architectural digest style. CRITICAL: NO TEXT, NO LETTERS, NO WORDS, NO FONTS anywhere in the image. Pure photography only." Darken the lower part of the scene for typography. NEVER substitute a generic scene that is unrelated to ${niche}.`
    : "";
  const accentRule = `Акцентный цвет рекламного макета: ${input.accentLabel} (HEX ${input.accentHex}). При генерации промпта для Flux добавляй тонкие отсветы, освещение или детали фона в этом оттенке, чтобы картинка гармонировала с версткой.`;
  const visualDiversityRule =
    "Для каждого креатива генерируй АБСОЛЮТНО НОВОЕ, уникальное визуальное описание (меняй ракурсы, освещение, атмосферу, композицию), даже если тексты повторяются. Визуал должен быть разнообразным.";
  const badgeRule = `Поле \`badge\` — это мощный маркетинговый триггер. Возьми текст из переданного поля Спецпредложения (hook / strategy.hook_concept) и выжми из него самую суть. ЛИМИТ: максимум до 8 слов. Фраза для бейджа ОБЯЗАНА быть грамматически полной и завершенной. Запрещено обрывать мысль. Если исходный триггер длинный, перефразируй и сократи его емко, но сохрани целостность фразы (например: 'Осталось всего 5 мест до конца месяца'). Примеры идеального бейджа: 'ВОЗЬМЕМ ТОЛЬКО 2 ПРОЕКТА В ЭТОМ МЕСЯЦЕ', 'СКИДКА 20% ДО ПЯТНИЦЫ', 'БЕСПЛАТНЫЙ РАСЧЕТ И КОНСУЛЬТАЦИЯ В ПОДАРОК'. Категорически запрещено вставлять туда длинные абзацы и предложения!`;
  const styleLabel = isSplitVsStyle(input.styleId)
    ? "стиль 1 — сплит До/После (VS), 2 картинки"
    : isSplitActionStyle(input.styleId)
      ? "стиль 2 — двусторонний сплит с акцентом, 2 картинки"
      : isPremiumDarkStyle(input.styleId)
        ? "стиль 3 — Premium Dark, 1 картинка на весь экран"
        : isSideFadeStyle(input.styleId)
          ? "стиль 4 — Side Fade, 1 картинка, текст слева"
          : isEditorialBlockStyle(input.styleId)
            ? "стиль 5 — Editorial Block, 1 картинка в правой колонке"
            : "одиночный стиль, 1 картинка";

  const systemPrompt = input.dual
    ? `CRITICAL RULE: DO NOT GENERATE ANY TEXT, LETTERS, NUMBERS, OR WORDS ON THE IMAGE. GENERATE ONLY A CLEAN BACKGROUND PHOTOGRAPH. ANY TEXT WILL RUIN THE IMAGE.

Роль: ты — арт-директор performance-креативов для Meta Ads (${styleLabel}).
Собери тексты для React-шаблона и ДВА независимых Flux-промпта фона.
ГЛОБАЛЬНОЕ ПРАВИЛО ВАЛЮТЫ: только $ / USD или €. Запрещены рубли (руб, ₽, RUB) и реалии СНГ.
Тексты (headline/subheadline/benefit/cta/badge) — на языке: ${language}. Они пойдут в HTML-шаблон, НЕ на картинку.
Если в sampled_copy уже выбран headline/subheadline/bullets/button — используй их как основу (можно слегка отполировать формулировку, но смысл сохрани).
${badgeRule}
${accentRule}
${visualDiversityRule}${nicheSplitRule}

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
  "badge": "триггер до 8 слов из hook, полная завершенная фраза",
  "prompt_before": "English Flux prompt — bleak problem-state photo, no text",
  "prompt_after": "English Flux prompt — bright success-state photo, no text"
}`
    : `CRITICAL RULE: DO NOT GENERATE ANY TEXT, LETTERS, NUMBERS, OR WORDS ON THE IMAGE. GENERATE ONLY A CLEAN BACKGROUND PHOTOGRAPH. ANY TEXT WILL RUIN THE IMAGE.

Роль: ты — арт-директор performance-креативов для Meta Ads (${styleLabel}).
Выбери тексты для React-шаблона и собери ОДИН финальный flux_prompt на английском. Это одиночный стиль: ровно одна картинка, без prompt_before/prompt_after.
ГЛОБАЛЬНОЕ ПРАВИЛО ВАЛЮТЫ: только $ / USD или €. Запрещены рубли (руб, ₽, RUB) и реалии СНГ.
Тексты на креативе (headline/subheadline/benefit/cta/badge) — на языке: ${language}. Эти тексты пойдут в React-шаблон, НЕ на картинку.
Если в sampled_copy уже выбран headline/subheadline/bullets/button — используй их как основу.
${badgeRule}
flux_prompt — строго на английском, готов к Flux.1: только чистая фотография фона, без типографики.
${accentRule}
${visualDiversityRule}${nicheSingleRule}

CRITICAL IMAGE RULE (Flux background only):
- NEVER put text, letters, numbers, logos with words, watermarks, or captions in flux_prompt.
- Describe only subject, lighting, composition, mood, and camera language.
- flux_prompt MUST be English. Marketing copy lives only in headline/subheadline/benefit/cta/badge fields.
- Add subtle accent-color lighting / reflections (${input.accentHex}) so the photo matches the layout accent.

Верни JSON:
{
  "headline": "краткий заголовок (1-5 слов)",
  "subheadline": "подзаголовок",
  "benefit": "выгода, строго до 5 слов",
  "cta": "короткий CTA",
  "badge": "триггер до 8 слов из hook, полная завершенная фраза",
  "flux_prompt": "Single English visual prompt for a clean background photograph only — no text, letters, numbers, or words"
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
          style_id: studioStyleNumericId(input.styleId),
          style_master_prompt: input.masterPrompt,
          niche,
          image_subject: niche,
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
            : "Use sampled_copy texts. Return exactly ONE flux_prompt (single image). Absolutely unique visual description for this creative_index even if copy repeats. Reflect accent color in lighting.",
        }),
      },
    ],
  });

  const hook = input.strategy?.strategy.hook_concept?.trim() ?? "";
  const parsed = parseArtDirection(completion.choices[0]?.message?.content ?? "", input.dual, hook);
  // Deterministic niche framing for the До/После split: whatever the model
  // wrote, the Flux prompt always opens with the client's niche as subject
  // (bad/messy "before" vs perfect/premium "after" of the SAME subject).
  const framed = isSplitVsStyle(input.styleId)
    ? {
        prompt_before: `Split-screen BEFORE photograph. Subject: ${niche}. Terrible, bad quality, messy, neglected version of ${niche}. ${parsed.prompt_before} Cinematic lighting, highly detailed, photographic, no text.`,
        prompt_after: `Split-screen AFTER photograph. Subject: ${niche}. Perfect, premium, clean, professional version of ${niche}. ${parsed.prompt_after} Cinematic lighting, highly detailed, photographic, no text.`,
      }
    : isSplitActionStyle(input.styleId)
      ? {
          prompt_before: `Split screen before and after shot of ${niche}. BEFORE (left side): black and white grayscale, messy, bad quality version of ${niche}. ${parsed.prompt_before} CRITICAL: NO TEXT, NO LETTERS, NO WORDS, NO FONTS anywhere in the image. Pure photography only.`,
          prompt_after: `Split screen before and after shot of ${niche}. AFTER (right side): full color, premium, perfect version of ${niche}. ${parsed.prompt_after} CRITICAL: NO TEXT, NO LETTERS, NO WORDS, NO FONTS anywhere in the image. Pure photography only.`,
        }
      : isPremiumDarkStyle(input.styleId)
        ? (() => {
            const single = `Premium, cinematic, dark moody photography of ${niche}. Highly detailed, 8k, architectural digest style. ${parsed.image_prompt} CRITICAL: NO TEXT, NO LETTERS, NO WORDS, NO FONTS anywhere in the image. Pure photography only.`;
            return { image_prompt: single, prompt_before: single, prompt_after: single };
          })()
        : {};
  return {
    ...parsed,
    ...framed,
    headline: input.sampled.headline?.trim() || parsed.headline,
    subheadline: input.sampled.subheadline?.trim() || parsed.subheadline,
    benefit: input.sampled.bullets[0]?.trim() || parsed.benefit,
    cta: input.sampled.button?.trim() || parsed.cta,
    badge: input.sampled.badge?.trim() || parsed.badge || limitBadgeWords(hook) || undefined,
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
  const imagePrompt = readText(row.image_prompt) || readText(row.flux_prompt);
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
  const pains = readText(row.pains);
  const key_advantages = readText(row.key_advantages);
  const offer = readText(row.offer);
  if (!product || !audience || !offer) return null;
  return { product, audience, pains, key_advantages, offer };
}

export function resolveStyleId(value: string): StudioStyleKey | null {
  return resolveStudioStyleKey(value);
}
