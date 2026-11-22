import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { ownedAgent } from "@/lib/google-calendar";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { testTwilioSmsConnection } from "@/lib/twilio-sms";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, error: "Агент не найден." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const saved = await savedSms(id);
    const result = await testTwilioSmsConnection({
      accountSid: text(body?.accountSid) || saved.accountSid,
      authToken: text(body?.authToken) || saved.authToken,
      phoneNumber: text(body?.phoneNumber) || saved.phoneNumber,
    });
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить Twilio SMS.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    const friendly = /twilio_sms_|twilio_account_sid|twilio_auth_token|schema cache/i.test(message)
      ? "Примените миграцию 20261122_agent_twilio_sms.sql."
      : message;
    return Response.json({ ok: false, error: friendly }, { status });
  }
}

async function savedSms(agentId: string) {
  const empty = { accountSid: "", authToken: "", phoneNumber: "" };
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agents")
    .select("twilio_account_sid, twilio_auth_token, twilio_sms_number")
    .eq("id", agentId)
    .maybeSingle();
  if (error || !data) return empty;
  return {
    accountSid: text(data.twilio_account_sid),
    authToken: text(data.twilio_auth_token),
    phoneNumber: text(data.twilio_sms_number),
  };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
