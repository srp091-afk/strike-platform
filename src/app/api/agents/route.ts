import { connection } from "next/server";

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

    const [agents, greenDefaults] = await Promise.all([listAgents(), Promise.resolve(readOptionalGreenCredentials())]);
    return Response.json(
      { agents, greenDefaults },
      { headers: { "Cache-Control": "private, max-age=10, stale-while-revalidate=30" } },
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось загрузить агентов." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
