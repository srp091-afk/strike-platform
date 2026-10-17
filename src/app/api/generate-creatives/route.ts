import { buildCreatives, parseFormattedBriefRow, publicCreativesError, resolveStyleId } from "@/lib/generate-creatives";
import { parseAdStrategy } from "@/lib/ad-strategy";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { isCreativeLanguage } from "@/lib/studio-styles";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 120;

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await getAuthenticatedUserId();
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
  const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
  const creativesCount = Number(record.creativesCount);
  const creativeLanguage = typeof record.creativeLanguage === "string" ? record.creativeLanguage.trim() : "";
  const styleIdRaw = typeof record.styleId === "string" ? record.styleId.trim() : "";

  if (!isUuid(projectId)) {
    return Response.json({ error: "Некорректный projectId." }, { status: 400 });
  }
  if (!Number.isInteger(creativesCount) || creativesCount < 1 || creativesCount > 5) {
    return Response.json({ error: "Выберите от 1 до 5 креативов." }, { status: 400 });
  }
  if (!isCreativeLanguage(creativeLanguage)) {
    return Response.json({ error: "Выберите язык текста на креативе." }, { status: 400 });
  }
  const styleId = resolveStyleId(styleIdRaw);
  if (!styleId) {
    return Response.json({ error: "Выберите визуальный стиль." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: project, error: projectError } = await supabase
    .from("ad_projects")
    .select("id, formatted_brief, strategy_data")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (projectError) {
    return Response.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return Response.json({ error: "Проект не найден." }, { status: 404 });
  }

  try {
    const creatives = await buildCreatives({
      count: creativesCount,
      language: creativeLanguage,
      styleId,
      brief: parseFormattedBriefRow(project.formatted_brief),
      strategy: parseAdStrategy(project.strategy_data),
    });

    const { error: updateError } = await supabase
      .from("ad_projects")
      .update({ creatives_data: creatives })
      .eq("id", projectId)
      .eq("user_id", userId);

    if (updateError) {
      if (/creatives_data/i.test(updateError.message)) {
        return Response.json(
          { error: "В базе нет колонки creatives_data. Выполните миграцию в Supabase." },
          { status: 500 },
        );
      }
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({ ok: true, creatives });
  } catch (error) {
    return Response.json({ error: publicCreativesError(error) }, { status: 500 });
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
