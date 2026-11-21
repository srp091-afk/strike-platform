import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { ownedAgent } from "@/lib/google-calendar";
import { loadPipedriveAgent, testPipedriveConnection } from "@/lib/pipedrive";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, error: "Агент не найден." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { pipedrive_api_token?: unknown } | null;
    const requestedToken = typeof body?.pipedrive_api_token === "string" ? body.pipedrive_api_token.trim() : "";
    const saved = requestedToken ? null : await loadPipedriveAgent(id);
    const token = requestedToken || saved?.token || "";

    const result = await testPipedriveConnection(token);
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить Pipedrive.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    const friendly = /pipedrive_api_token|schema cache/i.test(message)
      ? "Примените миграцию 20261121_agent_pipedrive.sql."
      : message;
    return Response.json({ ok: false, error: friendly }, { status });
  }
}
