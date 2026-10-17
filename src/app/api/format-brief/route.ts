import { formatBriefSummary, publicFormatError } from "@/lib/format-brief";
import { getAuthenticatedUserId } from "@/lib/auth-user";

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

  const briefSummary =
    body && typeof body === "object" && "brief_summary" in body && typeof body.brief_summary === "string"
      ? body.brief_summary.trim()
      : "";
  if (briefSummary.length < 12) {
    return Response.json({ error: "Бриф ещё не собран." }, { status: 400 });
  }
  if (briefSummary.length > 12000) {
    return Response.json({ error: "Бриф слишком длинный." }, { status: 400 });
  }

  try {
    const formatted = await formatBriefSummary(briefSummary);
    return Response.json(formatted);
  } catch (error) {
    return Response.json({ error: publicFormatError(error) }, { status: 500 });
  }
}
