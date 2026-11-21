import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { loadBitrixAgent, testBitrixConnection } from "@/lib/bitrix24";
import { ownedAgent } from "@/lib/google-calendar";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, error: "Агент не найден." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { bitrix_webhook_url?: unknown } | null;
    const requested = typeof body?.bitrix_webhook_url === "string" ? body.bitrix_webhook_url.trim() : "";
    const saved = requested ? null : await loadBitrixAgent(id);
    const webhook = requested || saved?.webhookUrl || "";

    const result = await testBitrixConnection(webhook);
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить Битрикс24.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    const friendly = /bitrix_webhook_url|schema cache/i.test(message)
      ? "Примените миграцию 20261121_agent_bitrix24.sql."
      : message;
    return Response.json({ ok: false, error: friendly }, { status });
  }
}
