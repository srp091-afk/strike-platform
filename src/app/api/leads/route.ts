import { connection } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { listCampaignCards } from "@/lib/outreach";

export async function GET() {
  await connection();
  try {
    const userId = await getAuthenticatedUserId();
    return Response.json({ campaigns: await listCampaignCards(userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить кампании." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
