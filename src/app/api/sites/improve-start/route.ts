import { connection } from "next/server";

import { deniedStatus, getEffectiveUserId } from "@/lib/account-context";
import { getOpenAI } from "@/lib/openai";
import { parseQuizSchema, type GiftsConfig, type StartScreen } from "@/lib/sites/quiz-schema";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  try {
    await getEffectiveUserId();
    const body = (await request.json()) as { title?: string; startScreen?: StartScreen; giftsConfig?: GiftsConfig };
    const title = body.title?.trim() || "Квиз";
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: [
            "Перепиши первый экран квиза языком прямого отклика. Без клише, без «уникальных решений» и «лидеров рынка».",
            "headline: одна конкретная фраза, измеримый результат оберни в ==двойные равенства==.",
            "subheadline: 1–2 прямых предложения, которые снимают возражение. bullets: ровно 4 коротких пункта, цифры оберни в **двойные звёздочки**.",
            "eyebrow: 3–5 слов. trustBadge.primaryText: короткий проверяемый факт-заглушка. ctaText: глагол результата. ctaMicroText.text: «N вопросов · займёт 45 сек».",
            "giftsConfig.items: один релевантный лид-магнит, type file, без выдуманного fileUrl.",
            "Верни JSON { startScreen, giftsConfig }. Не меняй layout, media и brand.",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify({ title, startScreen: body.startScreen, giftsConfig: body.giftsConfig }) },
      ],
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return Response.json({ error: "Модель ничего не вернула." }, { status: 502 });
    const generated = JSON.parse(raw) as { startScreen?: unknown; giftsConfig?: unknown };
    const parsed = parseQuizSchema({ startScreen: generated.startScreen, giftsConfig: generated.giftsConfig, steps: [{ id: "keep", title: "keep", type: "text_input" }] });
    return Response.json({ startScreen: parsed.startScreen, giftsConfig: parsed.giftsConfig });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Нужно войти") ? "Нужно войти." : error instanceof Error ? error.message : "Не удалось улучшить текст.";
    return Response.json({ error: message }, { status: deniedStatus(error, message === "Нужно войти." ? 401 : 500) });
  }
}
