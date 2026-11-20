import { connection } from "next/server";

import { exchangeCalendarCode, ownedAgent, saveCalendarToken } from "@/lib/google-calendar";

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const agentId = url.searchParams.get("state") ?? "";
  const back = new URL(agentId ? `/agents/${agentId}` : "/agents", request.url);
  const googleError = url.searchParams.get("error");
  if (googleError) {
    back.searchParams.set("calendar", "error");
    back.searchParams.set("message", "Google не подтвердил доступ к календарю.");
    return Response.redirect(back);
  }
  const code = url.searchParams.get("code") ?? "";
  if (!code || !agentId) {
    back.searchParams.set("calendar", "error");
    back.searchParams.set("message", "Google не вернул код авторизации.");
    return Response.redirect(back);
  }
  try {
    const owned = await ownedAgent(agentId);
    if (!owned) {
      back.searchParams.set("calendar", "error");
      back.searchParams.set("message", "Агент не найден.");
      return Response.redirect(back);
    }
    const refreshToken = await exchangeCalendarCode(request, code);
    if (!refreshToken) {
      back.searchParams.set("calendar", "error");
      back.searchParams.set("message", "Google не выдал постоянный доступ. Отключите приложение в аккаунте Google и подключите снова.");
      return Response.redirect(back);
    }
    await saveCalendarToken(agentId, owned.userId, refreshToken);
    back.searchParams.set("calendar", "connected");
    return Response.redirect(back);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось сохранить календарь.";
    if (message.includes("Нужно войти")) return Response.redirect(new URL("/login", request.url));
    back.searchParams.set("calendar", "error");
    back.searchParams.set(
      "message",
      /gcal_refresh_token|schema cache/i.test(message) ? "Примените миграцию 20261120_agent_google_calendar.sql." : "Не удалось подключить Google Calendar.",
    );
    return Response.redirect(back);
  }
}
