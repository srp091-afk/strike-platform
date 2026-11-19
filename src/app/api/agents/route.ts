import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { readAccess } from "@/lib/access";
import { listAgents, listChatAgents } from "@/lib/agents";
import { readOptionalGreenCredentials } from "@/lib/green-api";

export async function GET(request: Request) {
  await connection();
  const view = new URL(request.url).searchParams.get("view");

  try {
    if (view === "chat") {
      const agents = await listChatAgents();
      return Response.json(
        { agents },
        { headers: { "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } },
      );
    }

    const [agents, greenDefaults, access] = await Promise.all([
      listAgents(),
      Promise.resolve(readOptionalGreenCredentials()),
      readAccess(),
    ]);
    return Response.json(
      {
        agents,
        greenDefaults,
        agentAccess: { isAdmin: access.isAdmin, maxAgents: Number.isFinite(access.maxAgents) ? access.maxAgents : null },
      },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить агентов." },
      { status: deniedStatus(error), headers: { "Cache-Control": "no-store" } },
    );
  }
}
