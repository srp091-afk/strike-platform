import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const { pathname } = request.nextUrl;

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
    pathname === "/api/webhooks" ||
    pathname.startsWith("/api/webhooks/") ||
    // Публичный веб-виджет: страница в iframe на чужих сайтах и её чат-API.
    pathname === "/widget" ||
    pathname.startsWith("/widget/") ||
    pathname === "/api/widget-chat" ||
    // TEMP: local QA without Google — remove before relying on prod auth for chats.
    pathname === "/chats" ||
    pathname.startsWith("/chats/") ||
    pathname === "/api/chats" ||
    pathname.startsWith("/api/chats/") ||
    pathname === "/api/agents" ||
    pathname.startsWith("/api/agents/") ||
    // TEMP: local QA for creative download/ZIP/delete on project dashboard.
    pathname === "/ads" ||
    pathname.startsWith("/ads/") ||
    pathname === "/api/ads" ||
    pathname.startsWith("/api/ads/");

  // Локальный dev-сервер открывает страницы без Google. На production редирект остаётся
  // (кроме явных public routes выше — сейчас туда временно добавлены /chats для теста).
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

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
