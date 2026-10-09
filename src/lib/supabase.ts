import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

export function getSupabaseUrl() {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function createSupabaseBrowserClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"));
}
