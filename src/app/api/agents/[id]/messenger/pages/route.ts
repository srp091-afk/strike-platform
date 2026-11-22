import { connection } from "next/server";
import type { NextRequest } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { ownedAgent } from "@/lib/google-calendar";
import { messengerApp, readMessengerPages, MESSENGER_PAGES_COOKIE } from "@/lib/messenger";

/** Список страниц из временной куки: только id и имя, без токенов. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, error: "Агент не найден." }, { status: 404 });
    const app = messengerApp();
    if (!app) return Response.json({ ok: false, error: "Meta-приложение не настроено." }, { status: 500 });
    const pages = readMessengerPages(request.cookies.get(MESSENGER_PAGES_COOKIE)?.value, app.appSecret).map((page) => ({
      id: page.id,
      name: page.name,
    }));
    return Response.json({ ok: true, pages }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось прочитать страницы.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    return Response.json({ ok: false, error: message }, { status });
  }
}
