import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { ownedAgent } from "@/lib/google-calendar";
import { loadAgentBooking, readYclientsCompanyId, readYclientsPlatform, readYclientsToken, testYclientsConnection, type YclientsPlatform } from "@/lib/yclients";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, error: "Агент не найден." }, { status: 404 });

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const saved = await loadAgentBooking(id);
    const requestedPlatform = textField(body, "platform", "yclients_platform");
    const platform = (requestedPlatform ? readYclientsPlatform(requestedPlatform) : saved.creds?.platform ?? "yclients") as YclientsPlatform | null;
    if (!platform) return Response.json({ ok: false, error: "Платформа записи — YCLIENTS или Altegio." }, { status: 400 });

    const companyId = textField(body, "companyId", "yclients_company_id") || saved.creds?.companyId || "";
    const partnerToken = textField(body, "partnerToken", "yclients_partner_token") || saved.creds?.partnerToken || "";
    const userToken = textField(body, "userToken", "yclients_user_token") || saved.creds?.userToken || "";
    if (readYclientsCompanyId(companyId) === null || (partnerToken && readYclientsToken(partnerToken) === null)) {
      return Response.json({ ok: false, error: "Проверьте ID филиала и Partner Token." }, { status: 400 });
    }

    const result = await testYclientsConnection({ platform, companyId, partnerToken, userToken });
    return Response.json(result, { status: result.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проверить YCLIENTS.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    const friendly = /yclients_|schema cache/i.test(message) ? "Примените миграцию 20261121_agent_yclients_dikidi.sql." : message;
    return Response.json({ ok: false, error: friendly }, { status });
  }
}

function textField(body: Record<string, unknown> | null, ...keys: string[]) {
  for (const key of keys) {
    const value = body?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}
