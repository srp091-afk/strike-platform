import { parseAdStrategy } from "@/lib/ad-strategy";
import { fromDateInputValue } from "@/lib/ad-project-media";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  let userId: string;
  try {
    userId = await getAuthenticatedUserId();
  } catch {
    return Response.json({ error: "Нужно войти через Google." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) return Response.json({ error: "Некорректный id." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный JSON." }, { status: 400 });
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if ("name" in record) {
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (name.length < 1) return Response.json({ error: "Название не может быть пустым." }, { status: 400 });
    if (name.length > 120) return Response.json({ error: "Название слишком длинное." }, { status: 400 });
    patch.name = name;
  }

  if ("strategy_data" in record) {
    const strategy = parseAdStrategy(record.strategy_data);
    if (!strategy) return Response.json({ error: "Некорректная структура стратегии." }, { status: 400 });
    patch.strategy_data = strategy;
  }

  if ("creatives_replace_at" in record) {
    const raw = record.creatives_replace_at;
    if (typeof raw !== "string" || !raw.trim()) {
      return Response.json({ error: "Укажите дату замены креативов." }, { status: 400 });
    }
    const iso = raw.includes("T") ? raw.trim() : fromDateInputValue(raw);
    if (!iso || Number.isNaN(Date.parse(iso))) {
      return Response.json({ error: "Некорректная дата замены креативов." }, { status: 400 });
    }
    patch.creatives_replace_at = iso;
  }

  if (Object.keys(patch).length <= 1) {
    return Response.json({ error: "Нет полей для обновления." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ad_projects")
    .update(patch)
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, name, updated_at, creatives_replace_at, strategy_data")
    .maybeSingle();

  if (error) {
    console.error("[ads PATCH]", error);
    if (/updated_at|creatives_replace_at/i.test(error.message)) {
      return Response.json(
        { error: "В базе нет колонок дат. Выполните миграцию 20261017_ad_project_dates.sql." },
        { status: 500 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Проект не найден." }, { status: 404 });

  return Response.json({
    ok: true,
    id: data.id,
    name: data.name,
    updated_at: data.updated_at,
    creatives_replace_at: data.creatives_replace_at,
    strategy_data: data.strategy_data,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  let userId: string;
  try {
    userId = await getAuthenticatedUserId();
  } catch {
    return Response.json({ error: "Нужно войти через Google." }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isUuid(id)) return Response.json({ error: "Некорректный id." }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ad_projects")
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[ads DELETE]", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) return Response.json({ error: "Проект не найден." }, { status: 404 });

  return Response.json({ ok: true, id: data.id });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
