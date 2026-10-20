import { accentColorForPrompt, DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import { insertAdCreatives } from "@/lib/ad-creatives";
import { resolveCreativeFormat } from "@/lib/creative-format";
import { buildCreatives, parseFormattedBriefRow, publicCreativesError, resolveStyleId } from "@/lib/generate-creatives";
import { parseAdStrategy } from "@/lib/ad-strategy";
import { isRealCreativeImageUrl, plusDaysIso } from "@/lib/ad-project-media";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getCreativeTemplatePrompts } from "@/lib/creative-templates";
import { isCreativeLanguage, resolveCreativeStyleId, studioStyles } from "@/lib/studio-styles";
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
  // Style pack: `styleIds` = one template UUID per creative. Legacy callers
  // send a single `styleId`, repeated `quantity` times.
  const styleIdsRaw = Array.isArray(record.styleIds)
    ? record.styleIds.flatMap((value) =>
        typeof value === "string" && value.trim() ? [value.trim()] : [],
      )
    : [];
  const hasPack = styleIdsRaw.length > 0;
  const creativesCount = hasPack ? styleIdsRaw.length : Number(record.quantity ?? record.creativesCount);
  const creativeLanguageRaw = typeof record.creativeLanguage === "string" ? record.creativeLanguage.trim() : "";
  const styleIdRaw = typeof record.styleId === "string" ? record.styleId.trim() : "";
  const accentColorRaw = typeof record.accentColor === "string" ? record.accentColor.trim() : "";
  // Format toggle: "Лента (4:5)" vs "Сторис (9:16)" from dialog/wizard.
  const format = resolveCreativeFormat(record.format ?? record.aspectRatio ?? record.aspect_ratio);

  if (!isUuid(projectId)) {
    return Response.json({ error: "Некорректный projectId." }, { status: 400 });
  }
  if (!Number.isInteger(creativesCount) || creativesCount < 1 || creativesCount > 10) {
    return Response.json({ error: "Выберите от 1 до 10 креативов." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: project, error: projectError } = await supabase
    .from("ad_projects")
    .select("id, name, formatted_brief, strategy_data, style_key, creative_language, accent_color")
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

  // Resolve the pack: every entry keeps its own style + its DB system_prompt.
  const packRaws = hasPack
    ? styleIdsRaw
    : Array.from({ length: creativesCount }, () =>
        styleIdRaw || (typeof project.style_key === "string" ? project.style_key : ""),
      );
  const templatePrompts = await getCreativeTemplatePrompts(packRaws.filter((raw) => isUuid(raw)));
  const packEntries: { key: NonNullable<ReturnType<typeof resolveStyleId>>; name: string; masterPrompt: string | null }[] = [];
  for (const raw of packRaws) {
    const key = resolveStyleId(raw);
    if (!key) {
      return Response.json({ error: "Выберите визуальный стиль." }, { status: 400 });
    }
    const template = templatePrompts.get(raw.toLowerCase());
    packEntries.push({
      key,
      name: template?.name || studioStyles.find((style) => style.key === key)?.name || key,
      masterPrompt: template?.systemPrompt || null,
    });
  }
  const styleId = packEntries[0]!.key;
  // Persist the primary (first) style's creative_templates UUID as style_key.
  const storedStyleId = resolveCreativeStyleId(styleId) ?? styleId;
  const styleName = [...new Set(packEntries.map((entry) => entry.name))].join(", ");

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

  const storedAccent =
    typeof (project as { accent_color?: unknown }).accent_color === "string"
      ? String((project as { accent_color: string }).accent_color).trim()
      : "";
  const accentLabel = accentColorForPrompt(accentColorRaw || storedAccent || DEFAULT_ACCENT_COLOR);
  const accentHex = resolveAccentHex(accentColorRaw || storedAccent || DEFAULT_ACCENT_COLOR);

  try {
    const creatives = await buildCreatives({
      // One pack entry per creative: own style, own DB system_prompt.
      // Results stay index-aligned with packEntries, so creative.style_id
      // (stamped inside buildCreatives) links each image to its style.
      styles: packEntries.map((entry) => ({ styleId: entry.key, masterPrompt: entry.masterPrompt })),
      language: creativeLanguage,
      brief: parseFormattedBriefRow(project.formatted_brief),
      strategy,
      accentColor: accentLabel,
      aspectRatio: format,
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
      style_key: storedStyleId,
      creative_language: creativeLanguage,
      creatives_count: creativesCount,
      accent_color: accentHex,
      // Project-level format state (column added by 20261020_creative_format.sql;
      // pre-migration the fallback chain below strips it and still saves).
      aspect_ratio: format,
    };

    let updateError = (
      await supabase.from("ad_projects").update(projectPatch).eq("id", projectId).eq("user_id", userId)
    ).error;

    if (
      updateError &&
      /updated_at|creatives_replace_at|creatives_count|style_key|creative_language|accent_color|aspect_ratio/i.test(updateError.message)
    ) {
      const { accent_color: _accent, aspect_ratio: _aspect, ...withoutAccent } = projectPatch;
      updateError = (
        await supabase.from("ad_projects").update(withoutAccent).eq("id", projectId).eq("user_id", userId)
      ).error;
      if (updateError && /updated_at|creatives_replace_at|creatives_count|style_key|creative_language|aspect_ratio/i.test(updateError.message)) {
        updateError = (
          await supabase
            .from("ad_projects")
            .update({ creatives_data: creatives, status: "ready" })
            .eq("id", projectId)
            .eq("user_id", userId)
        ).error;
      }
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
    const generationRow = {
      project_id: projectId,
      title: `${projectName} · ${styleName}`,
      style_name: styleName,
      status: "ready",
      is_active: true,
      images: imageSets,
    };
    // Generation-level format state; pre-migration (no aspect_ratio column)
    // the insert transparently retries without it.
    let generationInsert = await supabase
      .from("ad_generations")
      .insert({ ...generationRow, aspect_ratio: format })
      .select("id, images")
      .single();
    if (generationInsert.error && /aspect_ratio/i.test(generationInsert.error.message)) {
      generationInsert = await supabase
        .from("ad_generations")
        .insert(generationRow)
        .select("id, images")
        .single();
    }
    const { data: generation, error: insertError } = generationInsert;

    if (insertError) {
      console.error("[generate-creatives] insert ad_generations", insertError);
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    // Source of truth for creative cards: one `ad_creatives` row per creative
    // (soft-deletable via deleted_at). Legacy ad_generations.images is still
    // written above, so a failed insert here must not fail the generation.
    const creativesInsert = await insertAdCreatives(
      supabase,
      creatives.map((creative, index) => ({
        project_id: projectId,
        generation_id: typeof generation?.id === "string" ? generation.id : null,
        image_url: creative.image_url,
        image_urls: imageSets[index] ?? creative.image_urls,
        headline: creative.texts.headline || null,
        body_text: creative.texts.subheadline || creative.texts.benefit || null,
        style_id: creative.style_id,
        texts: creative.texts,
        accent_color: accentHex,
        sort_index: index,
      })),
    );
    if (creativesInsert.error) {
      console.error("[generate-creatives] insert ad_creatives", creativesInsert.error);
    }

    console.log("[generate-creatives] saved generation", generation);

    return Response.json({
      ok: true,
      creatives,
      generationId: generation?.id ?? null,
      images: imageUrls,
      updated_at: nowIso,
      creatives_replace_at: replaceAt,
      accent_color: accentHex,
      aspect_ratio: format,
    });
  } catch (error) {
    console.error("[generate-creatives] fatal", error);
    return Response.json({ error: publicCreativesError(error) }, { status: 500 });
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
