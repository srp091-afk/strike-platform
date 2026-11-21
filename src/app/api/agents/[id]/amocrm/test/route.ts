import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { loadAmoAgent, testAmoConnection } from "@/lib/amocrm";
import { ownedAgent } from "@/lib/google-calendar";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, error: "Агент не найден." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { amo_domain?: unknown; amo_access_token?: unknown } | null;
    const requestedDomain = typeof body?.amo_domain === "string" ? body.amo_domain.trim() : "";
    const requestedToken = typeof body?.amo_access_token === "string" ? body.amo_access_token.trim() : "";
    const saved = requestedDomain && requestedToken ? null : await loadAmoAgent(id);
    const domain = requestedDomain || saved?.domain || "";
    const token = requestedToken || saved?.token || "";

    const result = await testAmoConnection(domain, token);
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить amoCRM.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    const friendly = /amo_domain|amo_access_token|schema cache/i.test(message)
      ? "Примените миграцию 20261121_agent_amocrm.sql."
      : message;
    return Response.json({ ok: false, error: friendly }, { status });
  }
}
