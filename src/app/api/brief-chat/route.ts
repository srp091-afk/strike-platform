import {
  applyQuestionLimit,
  briefSystemPrompt,
  confirmMessage,
  hasConfirmBullets,
  knownFacts,
  parseBriefReply,
  sanitizeBriefTurns,
} from "@/lib/brief-chat";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { filterSuggestions } from "@/lib/suggestion-filter";
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
    const asked = messages.filter((turn) => turn.role === "assistant").length;
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `${briefSystemPrompt}\n\nФакт для лимита: в истории уже ${asked} твоих реплик. Если их 10 или больше, этот ответ — 11-й шаг: status только "confirm", новый вопрос запрещён.`,
        },
        ...messages,
      ],
    });
    const reply = completion.choices[0]?.message?.content?.trim() ?? "";
    const parsed = reply ? parseBriefReply(reply) : null;
    if (!parsed) {
      if (asked >= 10) {
        const summary = knownFacts(messages);
        return Response.json({
          message: confirmMessage(summary, messages),
          suggestions: ["Да, всё супер, генерируем!", "Хочу добавить деталь"],
          status: "confirm",
          brief_summary: summary,
        });
      }
      return Response.json({
        message: "Не поймал мысль. Напиши ещё раз, что продаём и в каком регионе?",
        suggestions: [],
        status: "in_progress",
        brief_summary: null,
      });
    }

    const limited = applyQuestionLimit(messages, parsed);
    // Chips for the next step must not repeat anything the user already
    // answered — most importantly, УТП chips (step 5) vs the advantages
    // picked on step 4.
    const userAnswers = messages.filter((turn) => turn.role === "user").map((turn) => turn.content);
    const suggestions =
      limited.status === "in_progress"
        ? filterSuggestions(limited.suggestions, userAnswers)
        : limited.suggestions;
    // Guarantee the labeled bullet format for the final summary even if
    // the model answered with prose.
    const message =
      limited.status === "confirm" && !hasConfirmBullets(limited.message)
        ? confirmMessage(limited.briefSummary ?? knownFacts(messages), messages)
        : limited.message;
    return Response.json({
      message,
      suggestions,
      status: limited.status,
      brief_summary: limited.briefSummary,
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
