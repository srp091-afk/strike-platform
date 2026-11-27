import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { apexSiteSlug, hostName, internalSitePath, isAppHost, isCustomSiteHost, subdomainFromHost } from "@/lib/sites/domains";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { pathname } = request.nextUrl;
  const host = hostName(request.headers.get("host") ?? "");
  if (
    host &&
    !isAppHost(host) &&
    !pathname.startsWith("/_next") &&
    !pathname.startsWith("/api") &&
    pathname !== "/favicon.ico" &&
    !pathname.startsWith("/s-host/")
  ) {
    const sub = subdomainFromHost(host);
    if (sub || isCustomSiteHost(host)) {
      const url = request.nextUrl.clone();
      const suffix = pathname === "/" ? "" : pathname;
      url.pathname = `/s-host/${host}${suffix}`;
      return NextResponse.rewrite(url);
    }
  }

  if (isAppHost(host)) {
    const site = apexSiteSlug(pathname);
    if (site) {
      const url = request.nextUrl.clone();
      url.pathname = internalSitePath(site.slug, site.path);
      return NextResponse.rewrite(url);
    }
  }

  // Supabase при неразрешённом redirectTo возвращает на Site URL (/) с ?code=...: доводим вход до конца в /auth/callback,
  // иначе пользователь оказывается на лендинге без сессии.
  if (pathname === "/" && request.nextUrl.searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.searchParams.set("next", "/");
    return NextResponse.redirect(url);
  }

  // Не трогаем callback и подтверждение email: ссылка из письма приходит без сессии.
  if (pathname.startsWith("/auth/callback") || pathname.startsWith("/auth/confirm")) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isPublic =
    pathname === "/login" ||
    // Публичный лендинг, юридические страницы и манифест PWA.
    pathname === "/" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/refund" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/robots.txt" ||
    // Публичная маркетинговая страница тарифов.
    pathname === "/pricing" ||
    pathname === "/api/webhooks" ||
    pathname.startsWith("/api/webhooks/") ||
    // Крон Vercel приходит без сессии, защищён CRON_SECRET внутри роута.
    pathname.startsWith("/api/cron/") ||
    // Вебхук видеодвижка (сервер-сервер): защищён WEBHOOK_SECRET внутри роута.
    pathname === "/api/smm/webhooks/video-ready" ||
    // Воркер очереди рассылок: без сессии, защищён OUTREACH_WORKER_SECRET внутри роута.
    pathname === "/api/leads/worker" ||
    // Публичный веб-виджет: страница в iframe на чужих сайтах и её чат-API.
    pathname === "/widget" ||
    pathname.startsWith("/widget/") ||
    pathname === "/api/widget-chat" ||
    // Публичное демо голосового агента: ссылку отправляем клиентам без регистрации.
    pathname === "/demo" ||
    pathname.startsWith("/demo/") ||
    pathname.startsWith("/api/demo/") ||
    pathname.startsWith("/l/") ||
    pathname.startsWith("/s/") ||
    pathname.startsWith("/s-host/") ||
    pathname === "/api/sites/submit" ||
    pathname === "/api/sites/event";

  // Локальный dev-сервер открывает страницы без Google. На production редирект остаётся
  // для всего, кроме явных public routes выше.
  if (!user && !isPublic && process.env.NODE_ENV !== "development") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Если пользователь уже залогинен и идет на /login -> на /agents
  if (user && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/agents";
    return NextResponse.redirect(url);
  }

  // Залогиненный пользователь с лендинга уходит сразу в дашборд.
  if (user && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
