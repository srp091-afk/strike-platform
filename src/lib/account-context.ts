import "server-only";

import { cookies, headers } from "next/headers";
import { cache } from "react";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { ClientAccount } from "@/lib/active-account";

export const ACCOUNT_COOKIE = "strike_account_id";
export const ACCOUNT_HEADER = "x-account-id";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AccountAccessError extends Error {
  readonly status = 403;

  constructor(message = "Нет доступа к этому аккаунту.") {
    super(message);
    this.name = "AccountAccessError";
  }
}

export function deniedStatus(error: unknown, fallback = 500) {
  return error instanceof AccountAccessError ? 403 : fallback;
}

async function requestedAccountId() {
  const headerList = await headers();
  const cookieStore = await cookies();
  const fromHeader = headerList.get(ACCOUNT_HEADER)?.trim() ?? "";
  const fromCookie = cookieStore.get(ACCOUNT_COOKIE)?.value?.trim() ?? "";
  return fromHeader || fromCookie;
}

async function delegationExists(ownerId: string, delegateId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("account_delegations")
    .select("id")
    .eq("owner_id", ownerId)
    .eq("delegate_id", delegateId)
    .maybeSingle();
  if (error) {
    if (/account_delegations/.test(error.message)) return false;
    throw new AccountAccessError(error.message);
  }
  return Boolean(data);
}

/** Сессия остаётся своей. Чужой id возвращается только если этот пользователь явно выдал доступ. */
export const getEffectiveUserId = cache(async () => {
  const sessionId = await getAuthenticatedUserId();
  const requested = await requestedAccountId();
  if (!requested || requested === sessionId) return sessionId;
  if (!UUID_PATTERN.test(requested)) throw new AccountAccessError();
  const allowed = await delegationExists(requested, sessionId);
  if (!allowed) throw new AccountAccessError();
  return requested;
});

export async function readAccountSwitcher() {
  const sessionId = await getAuthenticatedUserId();
  const requested = (await cookies()).get(ACCOUNT_COOKIE)?.value?.trim() ?? "";
  const accounts = await listClientAccounts(sessionId);
  const activeAccountId = accounts.some((account) => account.id === requested) ? requested : sessionId;
  return { sessionId, activeAccountId, accounts };
}

async function listClientAccounts(sessionId: string): Promise<ClientAccount[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("account_delegations").select("owner_id").eq("delegate_id", sessionId);
  if (error || !data) return [];

  const ids = [...new Set(data.map((row) => row.owner_id).filter((id): id is string => typeof id === "string"))];
  const accounts: ClientAccount[] = [];
  for (const id of ids) {
    const [{ data: userData }, { data: profile }] = await Promise.all([
      admin.auth.admin.getUserById(id),
      admin.from("profiles").select("full_name").eq("id", id).maybeSingle(),
    ]);
    const email = userData.user?.email?.trim() ?? "";
    const name = typeof profile?.full_name === "string" ? profile.full_name.trim() : "";
    accounts.push({ id, email, name: name || email || "Клиент" });
  }
  return accounts.sort((left, right) => left.name.localeCompare(right.name, "ru"));
}
