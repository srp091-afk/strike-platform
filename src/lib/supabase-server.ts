import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { supabaseCookieOptions } from "@/lib/supabase-cookies";
import { getSupabaseUrl } from "@/lib/supabase";

function anonKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
  }
  return value;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const secure = forwarded ? forwarded === "https" : process.env.NODE_ENV === "production";

  return createServerClient(getSupabaseUrl(), anonKey(), {
    cookieOptions: supabaseCookieOptions(secure),
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies. src/middleware.ts refreshes the session.
        }
      },
    },
  });
}
