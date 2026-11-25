import "server-only";

import type { User } from "@supabase/supabase-js";
import { cache } from "react";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

const DEV_USER_ID = "b361877b-db6c-4fd4-bf25-6a4c97bdbb7d";

export type SignInMethod = "email" | "google";

export type NotificationSettings = {
  lowBalance: boolean;
  subscription: boolean;
  channelAlerts: boolean;
};

export type AccountProfile = {
  id: string;
  email: string;
  pendingEmail: string | null;
  displayName: string;
  googleName: string;
  avatarUrl: string | null;
  signInMethods: SignInMethod[];
  notifications: NotificationSettings;
  timezone: string | null;
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

  const email = user.email?.trim().toLowerCase() ?? "";
  if (email) {
    const { error: claimError } = await admin
      .from("account_delegations")
      .update({ delegate_id: user.id, updated_at: new Date().toISOString() })
      .eq("delegate_email", email)
      .is("delegate_id", null);
    if (claimError && !/account_delegations/.test(claimError.message)) {
      console.error("[delegations]", claimError.message);
    }
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
  const profile = await readOwnProfile(admin, user.id);
  const stored = profile.fullName;
  return {
    id: user.id,
    email,
    pendingEmail: typeof user.new_email === "string" && user.new_email.trim() ? user.new_email.trim() : null,
    displayName: stored || googleName,
    googleName,
    avatarUrl: avatarOf(metadata),
    signInMethods: signInMethodsOf(user),
    notifications: profile.notifications,
    timezone: profile.timezone,
  };
});

const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  lowBalance: true,
  subscription: true,
  channelAlerts: true,
};

async function readOwnProfile(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const full = await admin
    .from("profiles")
    .select("full_name, notification_settings, timezone")
    .eq("id", userId)
    .maybeSingle();
  if (!full.error) {
    return {
      fullName: typeof full.data?.full_name === "string" ? full.data.full_name.trim() : "",
      notifications: readNotifications(full.data?.notification_settings),
      timezone: typeof full.data?.timezone === "string" && full.data.timezone.trim() ? full.data.timezone.trim() : null,
    };
  }
  if (!/notification_settings|timezone/.test(full.error.message)) throw new Error(full.error.message);
  const basic = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  if (basic.error) throw new Error(basic.error.message);
  return {
    fullName: typeof basic.data?.full_name === "string" ? basic.data.full_name.trim() : "",
    notifications: DEFAULT_NOTIFICATIONS,
    timezone: null,
  };
}

function readNotifications(value: unknown): NotificationSettings {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    lowBalance: record.low_balance !== false,
    subscription: record.subscription !== false,
    channelAlerts: record.channel_alerts !== false,
  };
}

function signInMethodsOf(user: User): SignInMethod[] {
  const metadata = user.app_metadata ?? {};
  const listed = [
    ...(user.identities ?? []).map((identity) => identity.provider),
    ...(Array.isArray(metadata.providers) ? metadata.providers : []),
    metadata.provider,
  ];
  const names = new Set(listed.filter((item): item is string => typeof item === "string"));
  const methods: SignInMethod[] = [];
  if (names.has("email")) methods.push("email");
  if (names.has("google")) methods.push("google");
  if (methods.length === 0 && user.email) methods.push("email");
  return methods;
}
