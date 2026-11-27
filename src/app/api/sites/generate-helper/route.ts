import { connection } from "next/server";

import { deniedStatus, getEffectiveUserId } from "@/lib/account-context";
import { getOpenAI } from "@/lib/openai";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  try {
    await getEffectiveUserId();
    const body = (await request.json()) as {
      action?: string;
      title?: string;
      question?: string;
      subtitle?: string;
      options?: string[];
    };
    if (body.action !== "generate_step_helper") return Response.json({ error: "Неизвестное действие." }, { status: 400 });
    const question = body.question?.trim() ?? "";
    if (question.length < 3) return Response.json({ error: "Сначала напишите вопрос." }, { status: 400 });
    const options = (body.options ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8);
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: [
            "Напиши одну экспертную подсказку к вопросу квиза. 110–180 символов, русский, прямой язык.",
            "Запрещены штампы: «чтобы мы подобрали лучшее», «это поможет нам понять вас», «уникальное предложение».",
            "Объясни, почему ответ важен, через цифру или факт, либо сними конкретное возражение. Ключевую цифру оберни в **двойные звёздочки**.",
            "Верни JSON { \"text\": \"...\" }.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            niche: body.title?.trim() || "",
            question,
            subtitle: body.subtitle?.trim() || "",
            options,
          }),
        },
      ],
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return Response.json({ error: "Модель ничего не вернула." }, { status: 502 });
    const parsed = JSON.parse(raw) as { text?: string };
    const text = (parsed.text ?? "").replace(/\s+/g, " ").trim().slice(0, 220);
    if (text.length < 20) return Response.json({ error: "Подсказка вышла пустой." }, { status: 502 });
    return Response.json({ text });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Нужно войти") ? "Нужно войти." : error instanceof Error ? error.message : "Не удалось написать подсказку.";
    return Response.json({ error: message }, { status: deniedStatus(error, message === "Нужно войти." ? 401 : 500) });
  }
}
