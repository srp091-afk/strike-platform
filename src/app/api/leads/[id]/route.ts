import { connection } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { loadCampaignState } from "@/lib/outreach";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const userId = await getAuthenticatedUserId();
    const state = await loadCampaignState(userId, id);
    if (!state) return Response.json({ error: "Кампания не найдена." }, { status: 404 });
    return Response.json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить кампанию." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
