import { getAuthenticatedUserId } from "@/lib/auth-user";
import { CREATIVES_BUCKET } from "@/lib/creative-storage";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Hard-delete ONE archived creative (an image set inside an archived
 * ad_generations row). There is no standalone `creatives` table in this
 * schema: a creative lives as one entry of ad_generations.images
 * (`[url]` or `[before, after]`), mirrored for the active batch in
 * ad_projects.creatives_data — archived rows exist only in ad_generations.
 * Storage files in the `creatives` bucket are removed best-effort.
 */
export async function DELETE(request: Request, context: RouteContext) {
  let userId: string;
  try {
    userId = await getAuthenticatedUserId();
  } catch {
    return Response.json({ error: "Нужно войти через Google." }, { status: 401 });
  }

  const { id: projectId } = await context.params;
  if (!isUuid(projectId)) return Response.json({ error: "Некорректный id проекта." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный JSON." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const generationId = typeof record.generationId === "string" ? record.generationId.trim() : "";
  const creativeIndex = typeof record.creativeIndex === "number" ? record.creativeIndex : Number.NaN;

  if (!isUuid(generationId)) {
    return Response.json({ error: "Некорректный id генерации." }, { status: 400 });
  }
  if (!Number.isInteger(creativeIndex) || creativeIndex < 0) {
    return Response.json({ error: "Некорректный индекс креатива." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data: project, error: projectError } = await supabase
    .from("ad_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  if (!project) return Response.json({ error: "Проект не найден." }, { status: 404 });

  const { data: generation, error: generationError } = await supabase
    .from("ad_generations")
    .select("id, images, is_active")
    .eq("id", generationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (generationError) return Response.json({ error: generationError.message }, { status: 500 });
  if (!generation) return Response.json({ error: "Генерация не найдена." }, { status: 404 });
  if (generation.is_active === true) {
    return Response.json({ error: "Удалять можно только архивные креативы." }, { status: 400 });
  }

  const sets = normalizeImageSets(generation.images);
  if (creativeIndex >= sets.length) {
    return Response.json({ error: "Креатив не найден." }, { status: 404 });
  }

  const [removed] = sets.splice(creativeIndex, 1);
  const removedUrls = removed ?? [];
  const generationDeleted = sets.length === 0;

  if (generationDeleted) {
    const { error } = await supabase
      .from("ad_generations")
      .delete()
      .eq("id", generationId)
      .eq("project_id", projectId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await supabase
      .from("ad_generations")
      .update({ images: sets })
      .eq("id", generationId)
      .eq("project_id", projectId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // Best-effort: remove the underlying files from Supabase Storage.
  const storagePaths = removedUrls
    .map((url) => storagePathFromPublicUrl(url))
    .filter((path): path is string => Boolean(path));
  if (storagePaths.length > 0) {
    const { error: storageError } = await supabase.storage.from(CREATIVES_BUCKET).remove(storagePaths);
    if (storageError) {
      console.error("[ads creatives DELETE] storage remove", storageError.message);
    }
  }

  return Response.json({
    ok: true,
    generationId,
    creativeIndex,
    generationDeleted,
    remaining: sets.length,
    removedUrls,
  });
}

function normalizeImageSets(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  const sets: string[][] = [];
  for (const item of value) {
    if (typeof item === "string") {
      const url = item.trim();
      if (url) sets.push([url]);
      continue;
    }
    if (Array.isArray(item)) {
      const urls = item
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean);
      if (urls.length > 0) sets.push(urls);
    }
  }
  return sets;
}

function storagePathFromPublicUrl(url: string): string | null {
  const marker = `/storage/v1/object/public/${CREATIVES_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  const rawPath = url.slice(index + marker.length).split(/[?#]/)[0] ?? "";
  if (!rawPath) return null;
  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
