import { insertAdCreatives } from "@/lib/ad-creatives";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Soft-delete ONE archived creative.
 *
 * Creatives live as rows of `ad_creatives`; deletion is only
 * `UPDATE ad_creatives SET deleted_at = now()` — the row, its texts and
 * the Storage files stay intact, and every read filters
 * `deleted_at IS NULL`, so the creative disappears from the UI.
 *
 * Body: `{ creativeId }` for creatives that already have a row.
 * Legacy generations without rows use `{ generationId, creativeIndex }`:
 * the generation's sets are backfilled into `ad_creatives` first, with
 * `deleted_at` set on the target — still no physical deletion anywhere.
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
  const creativeId = typeof record.creativeId === "string" ? record.creativeId.trim() : "";
  const generationId = typeof record.generationId === "string" ? record.generationId.trim() : "";
  const creativeIndex = typeof record.creativeIndex === "number" ? record.creativeIndex : Number.NaN;

  const supabase = createSupabaseAdminClient();

  const { data: project, error: projectError } = await supabase
    .from("ad_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });
  if (!project) return Response.json({ error: "Проект не найден." }, { status: 404 });

  const deletedAt = new Date().toISOString();

  if (creativeId) {
    if (!isUuid(creativeId)) {
      return Response.json({ error: "Некорректный id креатива." }, { status: 400 });
    }
    return softDeleteByCreativeId(supabase, projectId, creativeId, deletedAt);
  }

  if (!isUuid(generationId)) {
    return Response.json({ error: "Некорректный id генерации." }, { status: 400 });
  }
  if (!Number.isInteger(creativeIndex) || creativeIndex < 0) {
    return Response.json({ error: "Некорректный индекс креатива." }, { status: 400 });
  }
  return softDeleteByGenerationIndex(supabase, projectId, generationId, creativeIndex, deletedAt);
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function softDeleteByCreativeId(
  supabase: AdminClient,
  projectId: string,
  creativeId: string,
  deletedAt: string,
) {
  const { data: creative, error: creativeError } = await supabase
    .from("ad_creatives")
    .select("id, generation_id, deleted_at")
    .eq("id", creativeId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (creativeError) return Response.json({ error: creativeError.message }, { status: 500 });
  if (!creative) return Response.json({ error: "Креатив не найден." }, { status: 404 });
  if (creative.deleted_at) return Response.json({ ok: true, creativeId, deletedAt: creative.deleted_at, alreadyDeleted: true });

  const archivedError = await ensureArchivedGeneration(supabase, projectId, creative.generation_id);
  if (archivedError) return archivedError;

  const { error } = await supabase
    .from("ad_creatives")
    .update({ deleted_at: deletedAt })
    .eq("id", creativeId)
    .eq("project_id", projectId)
    .is("deleted_at", null);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, softDeleted: true, creativeId, deletedAt });
}

async function softDeleteByGenerationIndex(
  supabase: AdminClient,
  projectId: string,
  generationId: string,
  creativeIndex: number,
  deletedAt: string,
) {
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

  // Existing row for this set? Just stamp deleted_at on it.
  const { data: existingRows, error: rowsError } = await supabase
    .from("ad_creatives")
    .select("id, sort_index, deleted_at")
    .eq("generation_id", generationId)
    .eq("project_id", projectId);
  if (rowsError) return Response.json({ error: rowsError.message }, { status: 500 });

  const target = (existingRows ?? []).find((row) => row.sort_index === creativeIndex);
  if (target) {
    if (target.deleted_at) {
      return Response.json({ ok: true, creativeId: target.id, deletedAt: target.deleted_at, alreadyDeleted: true });
    }
    const { error } = await supabase
      .from("ad_creatives")
      .update({ deleted_at: deletedAt })
      .eq("id", target.id)
      .eq("project_id", projectId)
      .is("deleted_at", null);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, softDeleted: true, creativeId: target.id, deletedAt });
  }

  // Legacy generation without rows: backfill all sets as ad_creatives rows,
  // stamping deleted_at only on the target. Images/Storage stay untouched.
  const backfill = await insertAdCreatives(
    supabase,
    sets.map((urls, index) => ({
      project_id: projectId,
      generation_id: generationId,
      image_url: urls[0] ?? "",
      image_urls: urls,
      headline: null,
      body_text: null,
      style_id: null,
      texts: null,
      accent_color: null,
      sort_index: index,
      deleted_at: index === creativeIndex ? deletedAt : null,
    })),
  );
  if (backfill.error) return Response.json({ error: backfill.error }, { status: 500 });

  return Response.json({ ok: true, softDeleted: true, generationId, creativeIndex, deletedAt });
}

async function ensureArchivedGeneration(
  supabase: AdminClient,
  projectId: string,
  generationId: unknown,
): Promise<Response | null> {
  if (typeof generationId !== "string" || !generationId) return null;
  const { data: generation, error } = await supabase
    .from("ad_generations")
    .select("id, is_active")
    .eq("id", generationId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (generation?.is_active === true) {
    return Response.json({ error: "Удалять можно только архивные креативы." }, { status: 400 });
  }
  return null;
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
