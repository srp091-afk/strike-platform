import { connection } from "next/server";

import { deniedStatus, getEffectiveUserId } from "@/lib/account-context";
import { listCampaignCards } from "@/lib/outreach";

export async function GET() {
  await connection();
  try {
    const userId = await getEffectiveUserId();
    return Response.json({ campaigns: await listCampaignCards(userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить кампании." },
      { status: deniedStatus(error), headers: { "Cache-Control": "no-store" } },
    );
  }
}
