import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { ownedAgent } from "@/lib/google-calendar";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { readViberBotName, readViberToken, setViberWebhook } from "@/lib/viber";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, error: "Агент не найден." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as { authToken?: unknown; botName?: unknown } | null;
    const saved = await savedViber(id);
    const typedToken = typeof body?.authToken === "string" ? body.authToken : "";
    const token = readViberToken(typedToken) || saved.token;
    if (!token) {
      return Response.json({ ok: false, error: "Введите Auth Token Viber." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    if (typedToken.trim() && readViberToken(typedToken) === null) {
      return Response.json({ ok: false, error: "Auth Token Viber содержит пробелы или слишком короткий." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const botName = readViberBotName(typeof body?.botName === "string" ? body.botName : saved.botName);
    const webhookUrl = `https://www.strikeplatform.io/api/webhooks/viber/${id}`;
    const result = await setViberWebhook(token, webhookUrl);
    if (!result.ok) return Response.json(result, { status: 400, headers: { "Cache-Control": "no-store" } });

    const { error } = await owned.admin
      .from("agents")
      .update({ viber_auth_token: token, viber_bot_name: botName || null })
      .eq("id", id)
      .eq("user_id", owned.userId);
    if (error) {
      const message = /viber_|schema cache/i.test(error.message) ? "Примените миграцию 20261122_agent_viber_email.sql." : error.message;
      return Response.json({ ok: false, error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось подключить Viber.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    const friendly = /viber_|schema cache/i.test(message) ? "Примените миграцию 20261122_agent_viber_email.sql." : message;
    return Response.json({ ok: false, error: friendly }, { status });
  }
}

async function savedViber(agentId: string) {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("agents").select("viber_auth_token, viber_bot_name, name").eq("id", agentId).maybeSingle();
  return {
    token: typeof data?.viber_auth_token === "string" ? data.viber_auth_token.trim() : "",
    botName: typeof data?.viber_bot_name === "string" && data.viber_bot_name.trim() ? data.viber_bot_name : typeof data?.name === "string" ? data.name : "",
  };
}
