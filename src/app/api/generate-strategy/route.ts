import { generateAdStrategy, publicModelError } from "@/lib/ad-strategy";
import { getAuthenticatedUserId } from "@/lib/auth-user";

export const maxDuration = 120;

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
    const strategy = await generateAdStrategy(briefSummary);
    return Response.json(strategy);
  } catch (error) {
    return Response.json({ error: publicModelError(error) }, { status: 500 });
  }
}
