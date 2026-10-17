import { extractCompleteBrief, briefSystemPrompt, sanitizeBriefTurns } from "@/lib/brief-chat";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getOpenAI } from "@/lib/openai";

export const maxDuration = 60;

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

  const messages = sanitizeBriefTurns(body);
  if (!messages) {
    return Response.json({ error: "Напишите ответ, чтобы продолжить бриф." }, { status: 400 });
  }

  try {
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [{ role: "system", content: briefSystemPrompt }, ...messages],
    });
    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    if (!reply) {
      return Response.json({ error: "Модель вернула пустой ответ." }, { status: 502 });
    }

    const briefSummary = extractCompleteBrief(reply);
    if (briefSummary) {
      return Response.json({ complete: true, brief_summary: briefSummary });
    }

    const trimmed = reply.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("{")) {
      return Response.json({
        complete: false,
        reply: "Пока рано закрывать бриф. Назовите продукт и регион конкретными словами.",
      });
    }

    return Response.json({ complete: false, reply });
  } catch (error) {
    return Response.json({ error: publicError(error) }, { status: 500 });
  }
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (!message || /sk-|api[_ ]?key/i.test(message)) return "Не удалось получить ответ модели.";
  return message;
}
