import { buildCreatives, parseFormattedBriefRow, publicCreativesError, resolveStyleId } from "@/lib/generate-creatives";
import { parseAdStrategy } from "@/lib/ad-strategy";
import { isRealCreativeImageUrl, plusDaysIso } from "@/lib/ad-project-media";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { isCreativeLanguage, studioStyles } from "@/lib/studio-styles";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 120;

const REPLACE_AFTER_DAYS = 14;

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
  const creativesCount = Number(record.quantity ?? record.creativesCount);
  const creativeLanguageRaw = typeof record.creativeLanguage === "string" ? record.creativeLanguage.trim() : "";
  const styleIdRaw = typeof record.styleId === "string" ? record.styleId.trim() : "";

  if (!isUuid(projectId)) {
    return Response.json({ error: "Некорректный projectId." }, { status: 400 });
  }
  if (!Number.isInteger(creativesCount) || creativesCount < 1 || creativesCount > 10) {
    return Response.json({ error: "Выберите от 1 до 10 креативов." }, { status: 400 });
  }

  const styleId = resolveStyleId(styleIdRaw);
  if (!styleId) {
    return Response.json({ error: "Выберите визуальный стиль." }, { status: 400 });
  }

  const styleName = studioStyles.find((style) => style.key === styleId)?.name ?? styleId;
  const supabase = createSupabaseAdminClient();
  const { data: project, error: projectError } = await supabase
    .from("ad_projects")
    .select("id, name, formatted_brief, strategy_data, style_key, creative_language")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (projectError) {
    console.error("[generate-creatives] load project", projectError);
    return Response.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return Response.json({ error: "Проект не найден." }, { status: 404 });
  }

  const strategy = parseAdStrategy(project.strategy_data);
  if (!strategy) {
    return Response.json(
      { error: "У проекта нет сохранённой стратегии. Сначала соберите тексты в брифе." },
      { status: 400 },
    );
  }

  const storedLanguage =
    typeof project.creative_language === "string" ? project.creative_language.trim() : "";
  const creativeLanguage = isCreativeLanguage(creativeLanguageRaw)
    ? creativeLanguageRaw
    : isCreativeLanguage(storedLanguage)
      ? storedLanguage
      : "ru";

  try {
    const creatives = await buildCreatives({
      count: creativesCount,
      language: creativeLanguage,
      styleId,
      brief: parseFormattedBriefRow(project.formatted_brief),
      strategy,
    });

    // Each creative stores [url] or [before, after]. Persist nested sets for the dashboard.
    const imageSets = creatives.map((creative) => {
      const urls = (creative.image_urls?.length ? creative.image_urls : [creative.image_url])
        .map((url) => url.trim())
        .filter((url) => isRealCreativeImageUrl(url));
      return urls.length > 0 ? urls : [creative.image_url].filter((url) => isRealCreativeImageUrl(url));
    });
    const imageUrls = imageSets.flat();

    console.log("[generate-creatives] built", {
      projectId,
      creativesCount: creatives.length,
      imageSets,
      imageUrls,
    });

    const now = new Date();
    const nowIso = now.toISOString();
    const replaceAt = plusDaysIso(now, REPLACE_AFTER_DAYS);

    // Archive previously active generations (status: archived via is_active=false).
    const { error: deactivateError } = await supabase
      .from("ad_generations")
      .update({ is_active: false })
      .eq("project_id", projectId)
      .eq("is_active", true);

    if (deactivateError) {
      console.error("[generate-creatives] deactivate generations", deactivateError);
      return Response.json({ error: deactivateError.message }, { status: 500 });
    }

    const projectPatch: Record<string, unknown> = {
      creatives_data: creatives,
      updated_at: nowIso,
      creatives_replace_at: replaceAt,
      status: "ready",
      style_key: styleId,
      creative_language: creativeLanguage,
      creatives_count: creativesCount,
    };

    let updateError = (
      await supabase.from("ad_projects").update(projectPatch).eq("id", projectId).eq("user_id", userId)
    ).error;

    if (updateError && /updated_at|creatives_replace_at|creatives_count|style_key|creative_language/i.test(updateError.message)) {
      updateError = (
        await supabase
          .from("ad_projects")
          .update({ creatives_data: creatives, status: "ready" })
          .eq("id", projectId)
          .eq("user_id", userId)
      ).error;
    }

    if (updateError) {
      console.error("[generate-creatives] update project", updateError);
      if (/creatives_data/i.test(updateError.message)) {
        return Response.json(
          { error: "В базе нет колонки creatives_data. Выполните миграцию в Supabase." },
          { status: 500 },
        );
      }
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    const projectName =
      typeof project.name === "string" && project.name.trim() ? project.name.trim() : "Кампания";
    const { data: generation, error: insertError } = await supabase
      .from("ad_generations")
      .insert({
        project_id: projectId,
        title: `${projectName} · ${styleName}`,
        style_name: styleName,
        status: "ready",
        is_active: true,
        images: imageSets,
      })
      .select("id, images")
      .single();

    if (insertError) {
      console.error("[generate-creatives] insert ad_generations", insertError);
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    console.log("[generate-creatives] saved generation", generation);

    return Response.json({
      ok: true,
      creatives,
      generationId: generation?.id ?? null,
      images: imageUrls,
      updated_at: nowIso,
      creatives_replace_at: replaceAt,
    });
  } catch (error) {
    console.error("[generate-creatives] fatal", error);
    return Response.json({ error: publicCreativesError(error) }, { status: 500 });
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
