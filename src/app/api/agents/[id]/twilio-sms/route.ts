import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { ownedAgent } from "@/lib/google-calendar";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ error: "Агент не найден." }, { status: 404 });

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("agents")
      .update({
        twilio_sms_enabled: false,
        twilio_account_sid: null,
        twilio_auth_token: null,
        twilio_sms_number: null,
      })
      .eq("id", id)
      .eq("user_id", owned.userId);
    if (error) {
      const message = /twilio_sms_|twilio_account_sid|twilio_auth_token|schema cache/i.test(error.message)
        ? "Примените миграцию 20261122_agent_twilio_sms.sql."
        : error.message;
      return Response.json({ error: message }, { status: 500 });
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отключить SMS.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    return Response.json({ error: message }, { status });
  }
}
