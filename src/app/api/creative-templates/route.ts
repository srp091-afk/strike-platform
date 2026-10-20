import { getAuthenticatedUserId } from "@/lib/auth-user";
import { listCreativeTemplates } from "@/lib/creative-templates";

export const maxDuration = 30;

/** Dynamic style list from Supabase `creative_templates` (active rows only). */
export async function GET() {
  try {
    await getAuthenticatedUserId();
  } catch {
    return Response.json({ error: "Нужно войти через Google." }, { status: 401 });
  }

  try {
    const templates = await listCreativeTemplates();
    return Response.json(
      { templates },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[creative-templates]", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить стили." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
