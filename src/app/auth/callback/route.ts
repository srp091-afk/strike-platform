import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase-server";

function nextPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/agents";
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const destination = nextPath(url.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(destination, url.origin));
    }
  }

  return NextResponse.redirect(new URL("/login", url.origin));
}
