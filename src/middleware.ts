import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { pathname } = request.nextUrl;

  // Supabase при неразрешённом redirectTo возвращает на Site URL (/) с ?code=...: доводим вход до конца в /auth/callback,
  // иначе пользователь оказывается на лендинге без сессии.
  if (pathname === "/" && request.nextUrl.searchParams.has("code")) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.searchParams.set("next", "/");
    return NextResponse.redirect(url);
  }

  // Не трогаем callback авторизации
  if (pathname.startsWith("/auth/callback")) {
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
    pathname.startsWith("/api/demo/");

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
