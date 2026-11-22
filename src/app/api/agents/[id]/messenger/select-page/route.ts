import { connection } from "next/server";
import { NextResponse, type NextRequest } from "next/server";

import { deniedStatus } from "@/lib/account-context";
import { ownedAgent } from "@/lib/google-calendar";
import { attachMessengerPage, MESSENGER_PAGES_COOKIE, MESSENGER_PAGES_PATH, messengerApp, readMessengerPages } from "@/lib/messenger";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const owned = await ownedAgent(id);
    if (!owned) return Response.json({ ok: false, error: "Агент не найден." }, { status: 404 });
    const app = messengerApp();
    if (!app) return Response.json({ ok: false, error: "Meta-приложение не настроено." }, { status: 500 });

    const body = (await request.json().catch(() => null)) as { pageId?: unknown } | null;
    const pageId = typeof body?.pageId === "string" ? body.pageId.trim() : "";
    const page = readMessengerPages(request.cookies.get(MESSENGER_PAGES_COOKIE)?.value, app.appSecret).find((item) => item.id === pageId);
    if (!page) {
      return Response.json({ ok: false, error: "Список страниц устарел. Подключите Facebook ещё раз." }, { status: 400 });
    }

    const saved = await attachMessengerPage(owned.admin, {
      agentId: id,
      userId: owned.userId,
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.accessToken,
    });
    const response = NextResponse.json(saved, { status: saved.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
    if (saved.ok) response.cookies.set(MESSENGER_PAGES_COOKIE, "", { maxAge: 0, path: MESSENGER_PAGES_PATH });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выбрать страницу.";
    const status = message.includes("Нужно войти") ? 401 : deniedStatus(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
