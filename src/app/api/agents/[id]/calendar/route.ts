import { connection } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { clearCalendarToken, ownedAgent, saveCalendarTimezone } from "@/lib/google-calendar";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ error: "Агент не найден." }, { status: 404 });
    await clearCalendarToken(id, owned.userId);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отключить календарь.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    return Response.json({ error: /gcal_refresh_token|schema cache/i.test(message) ? "Примените миграцию 20261120_agent_google_calendar.sql." : message }, { status });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ error: "Агент не найден." }, { status: 404 });
    const body = (await request.json().catch(() => null)) as { timezone?: unknown } | null;
    const timezone = typeof body?.timezone === "string" ? body.timezone : "";
    await saveCalendarTimezone(id, owned.userId, timezone);
    return Response.json({ ok: true, timezone }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить таймзону.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    return Response.json({ error: message }, { status });
  }
}
