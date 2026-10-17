import { generateAdStrategy, publicModelError } from "@/lib/ad-strategy";
import type { AdFormattedBrief } from "@/lib/ad-types";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { parseFormattedBrief } from "@/lib/format-brief";

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

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const briefSummary = typeof record.brief_summary === "string" ? record.brief_summary.trim() : "";
  if (briefSummary.length < 12) {
    return Response.json({ error: "Бриф ещё не собран." }, { status: 400 });
  }
  if (briefSummary.length > 12000) {
    return Response.json({ error: "Бриф слишком длинный." }, { status: 400 });
  }

  const formattedBrief = readFormattedBrief(record.formatted_brief);

  try {
    const strategy = await generateAdStrategy(briefSummary, formattedBrief);
    return Response.json(strategy);
  } catch (error) {
    return Response.json({ error: publicModelError(error) }, { status: 500 });
  }
}

function readFormattedBrief(value: unknown): AdFormattedBrief | null {
  if (typeof value === "string") {
    try {
      return parseFormattedBrief(JSON.parse(value) as unknown);
    } catch {
      return null;
    }
  }
  return parseFormattedBrief(value);
}
