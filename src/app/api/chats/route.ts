export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";

import { listConversations, listMessages } from "@/lib/chats";

export async function GET(request: NextRequest) {
  const conversationId = request.nextUrl.searchParams.get("conversation") ?? "";
  const agentId = readAgentFilter(request.nextUrl.searchParams.get("agentId"));

  try {
    const [conversations, messages] = await Promise.all([
      listConversations(agentId),
      conversationId ? listMessages(conversationId) : Promise.resolve([]),
    ]);

    return Response.json(
      { conversations, messages },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить чаты." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function readAgentFilter(value: string | null) {
  if (!value || value === "all") return null;
  return value;
}
