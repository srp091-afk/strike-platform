import type { NextRequest } from "next/server";

import { getGreenState } from "@/lib/green-api";
import { syncWhatsAppLink } from "@/lib/whatsapp-link";

export async function GET(request: NextRequest) {
  try {
    const state = await getGreenState();
    const agentId = request.nextUrl.searchParams.get("agent");
    if (state === "authorized" || state === "notAuthorized") {
      await syncWhatsAppLink(agentId, state === "authorized");
    }
    return Response.json({ state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[whatsapp state]", error instanceof Error ? error.message : error);
    return Response.json(
      { state: "error", message: "Не удалось проверить статус WhatsApp." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
