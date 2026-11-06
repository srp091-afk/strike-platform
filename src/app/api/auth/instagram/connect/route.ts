import { NextResponse, type NextRequest } from "next/server";

import { createState, INSTAGRAM_SCOPES, metaApp, OAUTH_COOKIE, OAUTH_COOKIE_PATH, redirectUri } from "@/lib/instagram";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Старт OAuth: GET /api/auth/instagram/connect?agentId=... → редирект на Facebook Login. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const agentId = request.nextUrl.searchParams.get("agentId") ?? "";
  const back = (query: string) => NextResponse.redirect(new URL(`/agents${UUID_PATTERN.test(agentId) ? `/${agentId}` : ""}?${query}`, origin));

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.redirect(new URL("/login", origin));
  if (!UUID_PATTERN.test(agentId)) return back("ig_error=" + encodeURIComponent("Агент не найден."));

  const { data: agent } = await createSupabaseAdminClient()
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!agent) return back("ig_error=" + encodeURIComponent("Агент не найден."));

  const app = metaApp();
  if (!app) return back("ig_error=" + encodeURIComponent("Meta-приложение не настроено (META_APP_ID / META_APP_SECRET)."));

  const { state, nonce } = createState(agentId, user.id, app.appSecret);
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", app.appId);
  url.searchParams.set("redirect_uri", redirectUri(origin));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_SCOPES.join(","));
  // Всегда показывать диалог выбора страниц/аккаунтов: иначе Meta молча использует прошлую (возможно, пустую) выдачу доступа.
  url.searchParams.set("auth_type", "rerequest");

  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: OAUTH_COOKIE_PATH,
  });
  return response;
}