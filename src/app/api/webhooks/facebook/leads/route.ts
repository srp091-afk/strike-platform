import { connection, type NextRequest } from "next/server";

/** Верификация вебхука Meta: GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=... */
export async function GET(request: NextRequest) {
  await connection();
  const params = request.nextUrl.searchParams;
  const expected = process.env.FB_VERIFY_TOKEN?.trim();
  if (!expected) return new Response("FB_VERIFY_TOKEN is not set", { status: 503 });
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new Response(params.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}
