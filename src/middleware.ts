import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isSecureRequest, supabaseCookieOptions } from "@/lib/supabase-cookies";

function isPublicPath(pathname: string) {
  return pathname === "/login" || pathname === "/api/webhooks" || pathname.startsWith("/api/webhooks/");
}

function redirectWithSession(request: NextRequest, session: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  session.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie.name, cookie.value);
  });
  return redirect;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The PKCE verifier cookie must reach the route handler unchanged.
  // getUser() here would clear it and the session cookies would never be stored.
  if (pathname === "/auth/callback" || pathname.startsWith("/auth/callback/")) {
    return NextResponse.next({ request });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    if (isPublicPath(pathname)) return NextResponse.next();
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookieOptions: supabaseCookieOptions(isSecureRequest(request)),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
        Object.entries(headers ?? {}).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  const { data } = await supabase.auth.getUser();

  if (data.user && pathname === "/login") {
    return redirectWithSession(request, response, "/agents");
  }

  if (!data.user && !isPublicPath(pathname)) {
    return redirectWithSession(request, response, "/login");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
