import { after, connection, type NextRequest } from "next/server";

import { verifySignature } from "@/lib/instagram";
import { processMessengerWebhook } from "@/lib/messenger-inbound";
import { messengerApp, messengerVerifyToken } from "@/lib/messenger";

export const maxDuration = 300;

/** Верификация подписки вебхука Meta для объекта Page. */
export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const expected = messengerVerifyToken();
  if (!expected) return new Response("Verify token is not set", { status: 503 });
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Входящие сообщения страницы. Подпись проверяется, 200 уходит сразу. */
export async function POST(request: NextRequest) {
  await connection();
  const app = messengerApp();
  if (!app) return Response.json({ error: "META_APP_SECRET is not set" }, { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), app.appSecret)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  after(async () => {
    try {
      await processMessengerWebhook(body);
    } catch (error) {
      console.error("[messenger webhook]", error instanceof Error ? error.message : error);
    }
  });
  return Response.json({ ok: true });
}
