import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { ownedAgent } from "@/lib/google-calendar";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const CLEARED = {
  stripe: { stripe_secret_key: null, stripe_webhook_secret: null },
  yookassa: { yookassa_secret_key: null },
  prodamus: { prodamus_secret_key: null },
} as const;

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ error: "Агент не найден." }, { status: 404 });
    const body = (await request.json().catch(() => null)) as { provider?: unknown } | null;
    const provider = body?.provider;
    if (provider !== "stripe" && provider !== "yookassa" && provider !== "prodamus") {
      return Response.json({ error: "Неизвестный платёжный шлюз." }, { status: 400 });
    }
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("agents").update(CLEARED[provider]).eq("id", id).eq("user_id", owned.userId);
    if (error) {
      const message = /stripe_|yookassa_|prodamus_|schema cache/i.test(error.message)
        ? "Примените миграцию 20261121_agent_payments.sql."
        : error.message;
      return Response.json({ error: message }, { status: 500 });
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отключить платёжный шлюз.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    return Response.json({ error: message }, { status });
  }
}
