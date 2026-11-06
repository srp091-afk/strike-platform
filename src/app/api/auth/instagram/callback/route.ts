import { NextResponse, type NextRequest } from "next/server";

import { readActiveChannels } from "@/lib/agent-models";
import { GRAPH, graphJson, metaApp, OAUTH_COOKIE, OAUTH_COOKIE_PATH, readState, redirectUri } from "@/lib/instagram";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type TokenResponse = { access_token: string };
type PagesResponse = {
  data?: {
    id: string;
    name?: string;
    access_token?: string;
    instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
  }[];
};

/** Возврат с Facebook Login: код → long-lived токен → токен страницы + Instagram Business аккаунт → agents. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;
  let agentId = "";

  const finish = (query: string) => {
    const response = NextResponse.redirect(new URL(`/agents${agentId ? `/${agentId}` : ""}?${query}`, origin));
    response.cookies.set(OAUTH_COOKIE, "", { maxAge: 0, path: OAUTH_COOKIE_PATH });
    return response;
  };
  const fail = (message: string) => finish("ig_error=" + encodeURIComponent(message));

  const app = metaApp();
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return NextResponse.redirect(new URL("/login", origin));
  if (!app) return fail("Meta-приложение не настроено.");

  const state = readState(params.get("state") ?? "", app.appSecret);
  const nonce = request.cookies.get(OAUTH_COOKIE)?.value;
  if (!state || state.u !== user.id || !nonce || nonce !== state.n) {
    return fail("Сессия авторизации устарела. Попробуйте подключить Instagram ещё раз.");
  }
  agentId = state.a;

  if (params.get("error")) return fail("Доступ к Instagram не был предоставлен.");
  const code = params.get("code");
  if (!code) return fail("Meta не вернула код авторизации.");

  const admin = createSupabaseAdminClient();
  const { data: agent } = await admin
    .from("agents")
    .select("id, active_channels")
    .eq("id", agentId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!agent) return fail("Агент не найден.");

  try {
    const redirect = redirectUri(origin);
    const short = await graphJson<TokenResponse>(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({
        client_id: app.appId,
        client_secret: app.appSecret,
        redirect_uri: redirect,
        code,
      })}`,
    );
    const long = await graphJson<TokenResponse>(
      `${GRAPH}/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: app.appId,
        client_secret: app.appSecret,
        fb_exchange_token: short.access_token,
      })}`,
    );
    // Токены страниц, полученные по long-lived пользовательскому токену, не истекают.
    const pages = await graphJson<PagesResponse>(
      `${GRAPH}/me/accounts?${new URLSearchParams({
        fields: "id,name,access_token,instagram_business_account{id,username,profile_picture_url}",
        limit: "50",
        access_token: long.access_token,
      })}`,
    );

    const page = (pages.data ?? []).find((item) => item.access_token && item.instagram_business_account?.id);
    const account = page?.instagram_business_account;
    if (!page || !account || !page.access_token) {
      return fail("Не найден Instagram Business аккаунт, привязанный к вашей Facebook-странице.");
    }

    const { data: taken } = await admin
      .from("agents")
      .select("id")
      .eq("instagram_account_id", account.id)
      .neq("id", agentId)
      .maybeSingle();
    if (taken) return fail("Этот Instagram-аккаунт уже подключён к другому агенту.");

    const channels = readActiveChannels(agent.active_channels);
    const { error } = await admin
      .from("agents")
      .update({
        instagram_account_id: account.id,
        instagram_access_token: page.access_token,
        instagram_username: account.username ?? null,
        instagram_page_id: page.id,
        instagram_avatar_url: account.profile_picture_url ?? null,
        active_channels: { ...channels, instagram: true },
      })
      .eq("id", agentId)
      .eq("user_id", user.id);
    if (error) {
      if (error.code === "23505") return fail("Этот Instagram-аккаунт уже подключён к другому агенту.");
      return fail("Не удалось сохранить подключение. Применена ли миграция Instagram?");
    }

    // Подписка страницы на входящие сообщения (webhook приложения → /api/webhooks/instagram).
    try {
      await graphJson(`${GRAPH}/${page.id}/subscribed_apps`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ subscribed_fields: "messages", access_token: page.access_token }),
      });
    } catch (error) {
      console.error("[instagram callback] subscribed_apps", error instanceof Error ? error.message : error);
      return fail("Аккаунт подключён, но не удалось подписаться на входящие сообщения.");
    }

    return finish("ig=connected");
  } catch (error) {
    console.error("[instagram callback]", error instanceof Error ? error.message : error);
    return fail("Не удалось завершить авторизацию через Meta.");
  }
}