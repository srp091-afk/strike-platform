import { connection } from "next/server";
import { NextResponse, type NextRequest } from "next/server";

import { getEffectiveUserId } from "@/lib/account-context";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { GRAPH, graphJson, readState } from "@/lib/instagram";
import {
  attachMessengerPage,
  MESSENGER_OAUTH_COOKIE,
  MESSENGER_OAUTH_PATH,
  MESSENGER_PAGES_COOKIE,
  MESSENGER_PAGES_MAX_AGE,
  MESSENGER_PAGES_PATH,
  messengerApp,
  messengerRedirectUri,
  sealMessengerPages,
  type MessengerPageChoice,
} from "@/lib/messenger";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type TokenResponse = { access_token: string };
type PageItem = { id?: string; name?: string; access_token?: string };
type PagesResponse = { data?: PageItem[] };

/** Возврат с Facebook Login: код → long-lived токен → страницы → подписка или выбор. */
export async function GET(request: NextRequest) {
  await connection();
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  let agentId = "";

  const finish = (query: string, pagesCookie?: string) => {
    const response = NextResponse.redirect(new URL(`/agents${agentId ? `/${agentId}` : ""}?${query}`, origin));
    response.cookies.set(MESSENGER_OAUTH_COOKIE, "", { maxAge: 0, path: MESSENGER_OAUTH_PATH });
    if (pagesCookie) {
      response.cookies.set(MESSENGER_PAGES_COOKIE, pagesCookie, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: MESSENGER_PAGES_MAX_AGE,
        path: MESSENGER_PAGES_PATH,
      });
    } else {
      response.cookies.set(MESSENGER_PAGES_COOKIE, "", { maxAge: 0, path: MESSENGER_PAGES_PATH });
    }
    return response;
  };
  const fail = (message: string) => finish("messenger_error=" + encodeURIComponent(message));

  try {
    await getAuthenticatedUserId();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Нужно войти")) return NextResponse.redirect(new URL("/login", origin));
    return fail(message || "Не удалось проверить вход.");
  }
  const app = messengerApp();
  if (!app) return fail("Meta-приложение не настроено (META_APP_ID / META_APP_SECRET).");

  let userId = "";
  try {
    userId = await getEffectiveUserId();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Нет доступа к этому аккаунту.");
  }

  const state = readState(params.get("state") ?? "", app.appSecret);
  const nonce = request.cookies.get(MESSENGER_OAUTH_COOKIE)?.value;
  if (!state || state.u !== userId || !nonce || nonce !== state.n) {
    return fail("Сессия авторизации устарела. Подключите Facebook ещё раз.");
  }
  agentId = state.a;
  if (params.get("error")) return fail("Доступ к страницам Facebook не был предоставлен.");
  const code = params.get("code");
  if (!code) return fail("Meta не вернула код авторизации.");

  const admin = createSupabaseAdminClient();
  const { data: agent } = await admin.from("agents").select("id").eq("id", agentId).eq("user_id", userId).maybeSingle();
  if (!agent) return fail("Агент не найден.");

  try {
    const redirect = messengerRedirectUri(origin);
    const short = await graphJson<TokenResponse>(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({
        client_id: app.appId,
        client_secret: app.appSecret,
        redirect_uri: redirect,
        code,
      })}`,
    );
    let userToken = short.access_token;
    try {
      const long = await graphJson<TokenResponse>(
        `${GRAPH}/oauth/access_token?${new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: app.appId,
          client_secret: app.appSecret,
          fb_exchange_token: short.access_token,
        })}`,
      );
      if (long.access_token) userToken = long.access_token;
    } catch (exchangeError) {
      console.error("[messenger] long-lived", exchangeError instanceof Error ? exchangeError.message : exchangeError);
    }

    const pagesResponse = await graphJson<PagesResponse>(
      `${GRAPH}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token", limit: "100", access_token: userToken })}`,
    );
    const pages = (pagesResponse.data ?? [])
      .filter((page): page is { id: string; name?: string; access_token: string } => Boolean(page.id && page.access_token))
      .map((page) => ({ id: page.id, name: (page.name ?? "").trim() || "Facebook", accessToken: page.access_token }));

    if (pages.length === 0) return fail("no_pages");
    if (pages.length === 1) {
      const only = pages[0]!;
      const saved = await attachMessengerPage(admin, {
        agentId,
        userId,
        pageId: only.id,
        pageName: only.name,
        pageAccessToken: only.accessToken,
      });
      if (!saved.ok) return fail(saved.error);
      return finish("messenger_connected=1");
    }

    const sealed = sealMessengerPages(pages satisfies MessengerPageChoice[], app.appSecret);
    if (sealed.length > 3800) return fail("Страниц слишком много для одного подключения. В окне Facebook оставьте только нужные.");
    return finish("messenger_select=1", sealed);
  } catch (error) {
    console.error("[messenger callback]", error instanceof Error ? error.message : error);
    return fail("Не удалось завершить авторизацию через Meta.");
  }
}
