import { connection } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const TYPES = new Set(["view", "quiz_start", "step_complete"]);

export async function POST(request: Request) {
  await connection();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const siteId = typeof body?.siteId === "string" ? body.siteId : "";
  const eventType = typeof body?.eventType === "string" ? body.eventType : "";
  if (!siteId || !TYPES.has(eventType)) return Response.json({ ok: false }, { status: 400 });
  const admin = createSupabaseAdminClient();
  const site = await admin.from("landings").select("id, status, views_count, starts_count").eq("id", siteId).maybeSingle();
  if (!site.data || site.data.status !== "published") return Response.json({ ok: false }, { status: 404 });
  await admin.from("site_events").insert({
    site_id: siteId,
    event_type: eventType,
    step_id: typeof body?.stepId === "string" ? body.stepId.slice(0, 40) : null,
    session_id: typeof body?.sessionId === "string" ? body.sessionId.slice(0, 80) : null,
  });
  if (eventType === "view") {
    await admin.from("landings").update({ views_count: Number(site.data.views_count ?? 0) + 1 }).eq("id", siteId);
  }
  if (eventType === "quiz_start") {
    await admin.from("landings").update({ starts_count: Number(site.data.starts_count ?? 0) + 1 }).eq("id", siteId);
  }
  return Response.json({ ok: true });
}
