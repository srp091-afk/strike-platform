import type { NextRequest } from "next/server";

import { getLanding, saveLanding } from "@/lib/landings";
import { LANDING_SECTION_TYPES, type LandingDocument } from "@/lib/landing-types";
import { getOpenAI } from "@/lib/openai";

export const maxDuration = 120;

const SYSTEM_PROMPT = `Ты — выдающийся ИИ-архитектор и маркетолог мирового масштаба, владеющий всеми канонами западного direct-response копирайтинга. Твоя цель — спроектировать премиальный одностраничный лендинг с мощным продающим текстом на основе запроса пользователя. Верни строго типизированный JSON. Используй динамический массив секций: sections: [{ type: 'hero', content: {...} }, { type: 'benefits', content: {...} }]. Ты сам решаешь, сколько и каких секций нужно для проекта. Пиши тексты, которые цепляют, давят на боли и продают по правилам топового маркетинга. Вся структура должна прогреть посетителя и перевести его в интерактивный ИИ-чат, для которого ты должен сгенерировать welcomeMessage.

Правила полей:
- Язык всех текстов — русский.
- title — короткое имя проекта для списка. subtitle — одна сильная строка под ним.
- Секций от 5 до 8. Первая — hero, последняя — cta.
- type только из списка: ${LANDING_SECTION_TYPES.join(", ")}.
- В content заполняй eyebrow, headline, text, primaryCta, secondaryCta. Неиспользуемое оставляй пустой строкой.
- items: 3–4 пункта. title и text — живой текст. meta — только короткое значение без подписи: «от 2 млн ₽», «основатель», «12 дней». Если meta не нужен, оставь пустую строку. Если пункты секции не нужны, верни пустой массив.
- theme: три HEX-цвета #RRGGBB. accent — насыщенный, background — светлый, foreground — почти чёрный.
- captureMode: chat, если нужен свободный диалог, или quiz, если лучше короткая квалификация.
- welcomeMessage — первая реплика чата, которая продолжает прогрев. successMessage — фраза после квиза.`;

const LANDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "welcomeMessage", "successMessage", "captureMode", "theme", "sections"],
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    welcomeMessage: { type: "string" },
    successMessage: { type: "string" },
    captureMode: { type: "string", enum: ["chat", "quiz"] },
    theme: {
      type: "object",
      additionalProperties: false,
      required: ["accent", "background", "foreground"],
      properties: {
        accent: { type: "string" },
        background: { type: "string" },
        foreground: { type: "string" },
      },
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "content"],
        properties: {
          type: { type: "string", enum: [...LANDING_SECTION_TYPES] },
          content: {
            type: "object",
            additionalProperties: false,
            required: ["eyebrow", "headline", "text", "primaryCta", "secondaryCta", "items"],
            properties: {
              eyebrow: { type: "string" },
              headline: { type: "string" },
              text: { type: "string" },
              primaryCta: { type: "string" },
              secondaryCta: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["title", "text", "meta"],
                  properties: {
                    title: { type: "string" },
                    text: { type: "string" },
                    meta: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      prompt?: string;
      landingId?: string;
      agentId?: string | null;
    };
    const prompt = body.prompt?.trim() ?? "";
    if (prompt.length < 8) {
      return Response.json({ error: "Опишите нишу хотя бы одним предложением." }, { status: 400 });
    }

    const existing = body.landingId ? await getLanding(body.landingId) : null;
    if (body.landingId && !existing) {
      return Response.json({ error: "Воронка не найдена." }, { status: 404 });
    }

    const userPrompt = existing
      ? `Текущий лендинг JSON:\n${JSON.stringify({
          title: existing.title,
          subtitle: existing.subtitle,
          welcomeMessage: existing.welcomeMessage,
          successMessage: existing.successMessage,
          captureMode: existing.captureMode,
          theme: existing.document.theme,
          sections: existing.document.sections,
        })}\n\nИзмени его по запросу:\n${prompt}`
      : prompt;

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.8,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "landing",
          strict: true,
          schema: LANDING_SCHEMA,
        },
      },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return Response.json({ error: "Модель вернула пустой ответ." }, { status: 502 });

    const generated = JSON.parse(raw) as {
      title: string;
      subtitle: string;
      welcomeMessage: string;
      successMessage: string;
      captureMode: "chat" | "quiz";
      theme: LandingDocument["theme"];
      sections: LandingDocument["sections"];
    };

    const document: LandingDocument = {
      prompt: existing?.document.prompt ? `${existing.document.prompt}\n\n${prompt}` : prompt,
      status: existing?.document.status ?? "draft",
      theme: generated.theme,
      sections: generated.sections,
    };

    const saved = await saveLanding({
      id: existing?.id,
      title: generated.title || existing?.title || "Новая воронка",
      subtitle: generated.subtitle,
      agentId: body.agentId === undefined ? (existing?.agentId ?? null) : body.agentId,
      captureMode: generated.captureMode,
      welcomeMessage: generated.welcomeMessage,
      successMessage: generated.successMessage,
      document,
    });

    return Response.json({ landing: saved });
  } catch (error) {
    console.error("[generate-landing]", error instanceof Error ? error.message : error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось собрать лендинг." },
      { status: 500 },
    );
  }
}
