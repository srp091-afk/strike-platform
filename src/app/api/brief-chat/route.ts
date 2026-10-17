import { briefSystemPrompt, parseBriefReply, sanitizeBriefTurns } from "@/lib/brief-chat";
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
      model: "gpt-4o",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: briefSystemPrompt }, ...messages],
    });
    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = reply ? parseBriefReply(reply) : null;
    if (!parsed) {
      return Response.json({
        message: "Не поймал мысль. Напиши ещё раз, что продаём и в каком регионе?",
        suggestions: [],
        status: "in_progress",
        brief_summary: null,
      });
    }

    return Response.json({
      message: parsed.message,
      suggestions: parsed.suggestions,
      status: parsed.status,
      brief_summary: parsed.briefSummary,
    });
  } catch (error) {
    return Response.json({ error: publicError(error) }, { status: 500 });
  }
}

function publicError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (!message || /sk-|api[_ ]?key/i.test(message)) return "Не удалось получить ответ модели.";
  return message;
}
