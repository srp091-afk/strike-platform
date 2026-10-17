import { getAuthenticatedUserId } from "@/lib/auth-user";
import { readBriefHistory } from "@/lib/brief-chat";
import { getOpenAI } from "@/lib/openai";

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    await getAuthenticatedUserId();
  } catch {
    return Response.json({ error: "Нужно войти через Google." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный JSON." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as { history?: unknown; draftText?: unknown }) : {};
  const history = readBriefHistory(record.history);
  const draftText = typeof record.draftText === "string" ? record.draftText.trim().slice(0, 4000) : "";

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Ты — ИИ-маркетолог. Пользователь формирует ответ на твой ПОСЛЕДНИЙ вопрос (возьми его из истории).
Его текущий черновик ответа: "${draftText}".
Твоя задача — предложить 3-4 коротких варианта (до 5 слов), которые логично дополнят его текст И СТРОГО ОТВЕЧАЮТ НА ТВОЙ ПОСЛЕДНИЙ ВОПРОС. Не предлагай выгоды, если обсуждаете ЦА.
Верни JSON: { "suggestions": ["вариант 1", "вариант 2", "вариант 3"] }`,
        },
        ...history,
      ],
    });
    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    return Response.json({ suggestions: readSuggestions(reply) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message || /sk-|api[_ ]?key/i.test(message)) {
      return Response.json({ error: "Не удалось обновить подсказки." }, { status: 500 });
    }
    return Response.json({ error: message }, { status: 500 });
  }
}

function readSuggestions(content: string) {
  try {
    const value = JSON.parse(content) as { suggestions?: unknown };
    if (!Array.isArray(value.suggestions)) return [];
    return value.suggestions
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 4);
  } catch {
    return [];
  }
}
