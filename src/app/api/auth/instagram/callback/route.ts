import { NextResponse, type NextRequest } from "next/server";

import { readActiveChannels } from "@/lib/agent-models";
import { GRAPH, graphJson, metaApp, OAUTH_COOKIE, OAUTH_COOKIE_PATH, readState, redirectUri } from "@/lib/instagram";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

type TokenResponse = { access_token: string };
type InstagramAccount = { id: string; username?: string; profile_picture_url?: string };
type PageItem = {
  id: string;
  name?: string;
  access_token?: string;
  instagram_business_account?: InstagramAccount;
  connected_instagram_account?: InstagramAccount;
};
type PagesResponse = { data?: PageItem[] };

const IG_FIELDS = "instagram_business_account{id,username,profile_picture_url},connected_instagram_account{id,username,profile_picture_url}";

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
    const pagesResponse = await graphJson<PagesResponse>(
      `${GRAPH}/me/accounts?${new URLSearchParams({
        fields: `id,name,access_token,${IG_FIELDS}`,
        limit: "100",
        access_token: long.access_token,
      })}`,
    );
    const pages = [...(pagesResponse.data ?? [])];

    // /me/accounts при выборочном доступе иногда пуст, хотя страницы выбраны в диалоге Meta:
    // берём их ID из granular_scopes токена (debug_token) и запрашиваем страницы напрямую.
    if (pages.length === 0) {
      try {
        const debug = await graphJson<{ data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } }>(
          `${GRAPH}/debug_token?${new URLSearchParams({
            input_token: long.access_token,
            access_token: `${app.appId}|${app.appSecret}`,
          })}`,
        );
        const granular = debug.data?.granular_scopes ?? [];
        console.log("[INSTAGRAM_GRANULAR]", JSON.stringify(granular));
        const pageIds = new Set(
          granular
            .filter((item) => item.scope === "pages_show_list" || item.scope === "pages_read_engagement")
            .flatMap((item) => item.target_ids ?? []),
        );
        for (const pageId of pageIds) {
          try {
            const direct = await graphJson<PageItem>(
              `${GRAPH}/${pageId}?${new URLSearchParams({
                fields: `id,name,access_token,${IG_FIELDS}`,
                access_token: long.access_token,
              })}`,
            );
            pages.push(direct);
          } catch (directError) {
            console.log("[INSTAGRAM_DIRECT_PAGE]", pageId, directError instanceof Error ? directError.message : directError);
          }
        }
      } catch (debugError) {
        console.log("[INSTAGRAM_GRANULAR] failed", debugError instanceof Error ? debugError.message : debugError);
      }
    }
    // Токены страниц в лог не попадают.
    console.log(
      "[INSTAGRAM_PAGES]",
      JSON.stringify(
        pages.map(({ access_token, ...rest }) => ({ ...rest, has_page_token: Boolean(access_token) })),
        null,
        2,
      ),
    );

    if (pages.length === 0) {
      // Диагностика: какие права реально выданы (без токенов).
      try {
        const perms = await graphJson<{ data?: { permission: string; status: string }[] }>(
          `${GRAPH}/me/permissions?${new URLSearchParams({ access_token: long.access_token })}`,
        );
        console.log("[INSTAGRAM_PERMISSIONS]", JSON.stringify(perms.data ?? []));
      } catch (permError) {
        console.log("[INSTAGRAM_PERMISSIONS] failed", permError instanceof Error ? permError.message : permError);
      }
    }

    // Перебираем ВСЕ страницы: берём первую, у которой есть привязанный Instagram-аккаунт.
    let page: PageItem | null = null;
    let account: InstagramAccount | null = null;
    for (const item of pages) {
      if (!item.access_token) continue;
      let candidate = item.instagram_business_account ?? item.connected_instagram_account ?? null;
      if (!candidate?.id) {
        // Запасной запрос напрямую по странице (токеном страницы) — иногда поле не приходит списком.
        try {
          const detail = await graphJson<PageItem>(
            `${GRAPH}/${item.id}?${new URLSearchParams({ fields: IG_FIELDS, access_token: item.access_token })}`,
          );
          candidate = detail.instagram_business_account ?? detail.connected_instagram_account ?? null;
        } catch (lookupError) {
          // Текст ошибки Graph (без токенов) подсказывает, каких прав не хватает.
          console.log("[INSTAGRAM_PAGE_LOOKUP]", item.id, lookupError instanceof Error ? lookupError.message : lookupError);
          candidate = null;
        }
      }
      if (candidate?.id) {
        page = item;
        account = candidate;
        break;
      }
    }

    if (!page || !account || !page.access_token) {
      return fail(
        pages.length === 0
          ? "Meta не вернула ни одной Facebook-страницы. При входе выберите страницу и аккаунт Instagram в окне разрешений."
          : "Ни у одной из ваших Facebook-страниц нет привязанного Instagram Business аккаунта.",
      );
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
      // Без pages_manage_metadata подписка страницы может быть недоступна: события приходят и по подписке приложения (Webhooks → Instagram → messages).
      console.error("[instagram callback] subscribed_apps", error instanceof Error ? error.message : error);
    }

    return finish("ig=connected");
  } catch (error) {
    console.error("[instagram callback]", error instanceof Error ? error.message : error);
    return fail("Не удалось завершить авторизацию через Meta.");
  }
}