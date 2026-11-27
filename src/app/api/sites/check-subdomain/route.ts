import { connection } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { normalizeSubdomain } from "@/lib/sites/domains";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  await connection();
  try {
    await getAuthenticatedUserId();
  } catch {
    return Response.json({ available: false, normalized: "", reason: "Нужно войти." }, { status: 401 });
  }
  const slug = new URL(request.url).searchParams.get("slug") ?? "";
  const except = new URL(request.url).searchParams.get("except") ?? "";
  const normalized = normalizeSubdomain(slug);
  if (!normalized.ok) return Response.json({ available: false, normalized: "", reason: normalized.reason });
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("landings").select("id").eq("subdomain", normalized.slug).maybeSingle();
  if (error) return Response.json({ available: false, normalized: normalized.slug, reason: "Не удалось проверить имя." });
  const taken = Boolean(data && data.id !== except);
  return Response.json({
    available: !taken,
    normalized: normalized.slug,
    reason: taken ? "Это имя уже занято." : undefined,
  });
}
