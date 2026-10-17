import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const DEV_USER_ID = "b361877b-db6c-4fd4-bf25-6a4c97bdbb7d";

export type AccountProfile = {
  id: string;
  email: string;
  displayName: string;
  googleName: string;
  avatarUrl: string | null;
};

function metadataText(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function googleNameOf(metadata: Record<string, unknown>, email: string) {
  return metadataText(metadata, "full_name") || metadataText(metadata, "name") || email || "STRIKE";
}

function avatarOf(metadata: Record<string, unknown>) {
  return metadataText(metadata, "avatar_url") || metadataText(metadata, "picture") || null;
}

const readUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (!error && data.user) return data.user;
  if (process.env.NODE_ENV === "development") return developmentUser();
  return null;
});

function developmentUser(): User {
  return {
    id: DEV_USER_ID,
    aud: "authenticated",
    email: "srp091@gmail.com",
    app_metadata: {},
    user_metadata: { full_name: "Сергей Пашко" },
    created_at: "2026-10-13T12:20:18.000Z",
  } as User;
}

export const getAuthenticatedUserId = cache(async () => {
  const user = await readUser();
  if (!user) {
    throw new Error("Нужно войти через Google.");
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = googleNameOf(metadata, user.email ?? "");
  const admin = createSupabaseAdminClient();
  const { error: profileError } = await admin.from("profiles").upsert(
    { id: user.id, full_name: fullName },
    { onConflict: "id", ignoreDuplicates: true },
  );

  if (profileError) {
    throw new Error(profileError.message);
  }

  return user.id;
});

export const getAccountProfile = cache(async (): Promise<AccountProfile | null> => {
  const user = await readUser();
  if (!user) return null;

  await getAuthenticatedUserId();
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const email = user.email ?? "";
  const googleName = googleNameOf(metadata, email);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  const stored = typeof data?.full_name === "string" ? data.full_name.trim() : "";
  return {
    id: user.id,
    email,
    displayName: stored || googleName,
    googleName,
    avatarUrl: avatarOf(metadata),
  };
});
