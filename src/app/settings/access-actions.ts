"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

import { ACCOUNT_COOKIE } from "@/lib/account-context";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getSupabaseUrl } from "@/lib/supabase";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DelegationRow = {
  id: string;
  delegateEmail: string;
  delegateId: string | null;
};

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  };
}

async function userIdByEmail(email: string) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const response = await fetch(`${getSupabaseUrl()}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${key}`, apikey: key },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as { users?: { id?: string; email?: string }[] };
  const match = (payload.users ?? []).find((user) => user.email?.trim().toLowerCase() === email);
  return match?.id ?? null;
}

export async function listOwnedDelegations(): Promise<{ rows: DelegationRow[]; error: string | null }> {
  const ownerId = await getAuthenticatedUserId();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("account_delegations")
    .select("id, delegate_email, delegate_id")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false });
  if (error) {
    const missing = /account_delegations/.test(error.message);
    return { rows: [], error: missing ? "Примените миграцию 20261119_account_delegations.sql." : error.message };
  }
  return {
    rows: (data ?? []).map((row) => ({
      id: String(row.id),
      delegateEmail: String(row.delegate_email),
      delegateId: typeof row.delegate_id === "string" ? row.delegate_id : null,
    })),
    error: null,
  };
}

export async function grantAccess(emailInput: string) {
  const ownerId = await getAuthenticatedUserId();
  const email = emailInput.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) return { ok: false as const, error: "Введите email." };

  const admin = createSupabaseAdminClient();
  const { data: self } = await admin.auth.admin.getUserById(ownerId);
  if (self.user?.email?.trim().toLowerCase() === email) {
    return { ok: false as const, error: "Нельзя выдать доступ самому себе." };
  }

  const delegateId = await userIdByEmail(email);
  const { error } = await admin.from("account_delegations").insert({
    owner_id: ownerId,
    delegate_email: email,
    delegate_id: delegateId,
  });
  if (error) {
    if (error.code === "23505") return { ok: false as const, error: "Доступ для этого email уже выдан." };
    const missing = /account_delegations/.test(error.message);
    return { ok: false as const, error: missing ? "Примените миграцию 20261119_account_delegations.sql." : error.message };
  }

  revalidatePath("/settings");
  return { ok: true as const, error: null };
}

export async function revokeAccess(id: string) {
  if (!UUID_PATTERN.test(id)) return { ok: false as const, error: "Запись не найдена." };
  const ownerId = await getAuthenticatedUserId();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("account_delegations").delete().eq("id", id).eq("owner_id", ownerId).select("id");
  if (error) return { ok: false as const, error: error.message };
  if (!data?.length) return { ok: false as const, error: "Запись не найдена." };
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { ok: true as const, error: null };
}

export async function switchAccount(accountId: string) {
  const sessionId = await getAuthenticatedUserId();
  const jar = await cookies();
  if (!accountId || accountId === sessionId) {
    jar.delete(ACCOUNT_COOKIE);
    revalidatePath("/", "layout");
    return { ok: true as const, error: null };
  }
  if (!UUID_PATTERN.test(accountId)) return { ok: false as const, error: "Нет доступа к этому аккаунту." };

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("account_delegations")
    .select("id")
    .eq("owner_id", accountId)
    .eq("delegate_id", sessionId)
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: "Нет доступа к этому аккаунту." };

  jar.set(ACCOUNT_COOKIE, accountId, cookieOptions());
  revalidatePath("/", "layout");
  return { ok: true as const, error: null };
}
