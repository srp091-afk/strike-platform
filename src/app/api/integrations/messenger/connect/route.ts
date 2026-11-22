import { connection } from "next/server";
import { NextResponse, type NextRequest } from "next/server";

import { getEffectiveUserId } from "@/lib/account-context";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createState } from "@/lib/instagram";
import { MESSENGER_OAUTH_COOKIE, MESSENGER_OAUTH_PATH, MESSENGER_SCOPES, messengerApp, messengerLoginConfigId, messengerRedirectUri } from "@/lib/messenger";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Старт OAuth: выбрать Facebook-страницу и выдать доступ к сообщениям. */
export async function GET(request: NextRequest) {
  await connection();
  const origin = request.nextUrl.origin;
  const agentId = request.nextUrl.searchParams.get("agentId") ?? "";
  const back = (query: string) => NextResponse.redirect(new URL(`/agents${UUID_PATTERN.test(agentId) ? `/${agentId}` : ""}?${query}`, origin));

  try {
    await getAuthenticatedUserId();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Нужно войти")) return NextResponse.redirect(new URL("/login", origin));
    return back("messenger_error=" + encodeURIComponent(message || "Не удалось проверить вход."));
  }
  if (!UUID_PATTERN.test(agentId)) return back("messenger_error=" + encodeURIComponent("Агент не найден."));

  let userId = "";
  try {
    userId = await getEffectiveUserId();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Нет доступа к этому аккаунту.";
    return back("messenger_error=" + encodeURIComponent(message));
  }

  const { data: agent } = await createSupabaseAdminClient().from("agents").select("id").eq("id", agentId).eq("user_id", userId).maybeSingle();
  if (!agent) return back("messenger_error=" + encodeURIComponent("Агент не найден."));

  const app = messengerApp();
  if (!app) return back("messenger_error=" + encodeURIComponent("Meta-приложение не настроено (META_APP_ID / META_APP_SECRET)."));

  const { state, nonce } = createState(agentId, userId, app.appSecret);
  const url = new URL("https://www.facebook.com/v21.0/dialog/oauth");
  url.searchParams.set("client_id", app.appId);
  url.searchParams.set("redirect_uri", messengerRedirectUri(origin));
  url.searchParams.set("state", state);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("auth_type", "rerequest");
  const configId = messengerLoginConfigId();
  if (configId) {
    // Конфигурация Login for Business сама задаёт права и выбор страниц. scope рядом с ней Meta просит не передавать.
    url.searchParams.set("config_id", configId);
    url.searchParams.set("override_default_response_type", "true");
  } else {
    url.searchParams.set("scope", MESSENGER_SCOPES.join(","));
  }

  const response = NextResponse.redirect(url);
  response.cookies.set(MESSENGER_OAUTH_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: MESSENGER_OAUTH_PATH,
  });
  return response;
}
