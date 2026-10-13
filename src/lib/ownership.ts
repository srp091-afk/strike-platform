import "server-only";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const OWNERSHIP_CONFIRM = "REASSIGN_TO_SESSION";

const WORKSPACE_EMAIL = "owner@strike.local";
const TABLES = ["agents", "integrations", "conversations", "messages"] as const;

type OwnedTable = (typeof TABLES)[number];

type AuthAccount = {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
};

type Bucket = {
  userId: string | null;
  count: number;
  action: "keep" | "move" | "leave";
  reason: string;
};

export type OwnershipReport = {
  session: { id: string; email: string };
  oldestProfileId: string | null;
  reads: { agents: "session"; chats: "session"; webhook: "agents.user_id" };
  authUsers: AuthAccount[];
  tables: Record<OwnedTable, Bucket[]>;
  agents: { id: string; name: string; userId: string | null }[];
  plan: {
    targetUserId: string;
    moveFrom: string[];
    leave: { userId: string; reason: string }[];
    nulls: OwnedTable[];
  };
};

export async function readOwnershipReport(): Promise<OwnershipReport> {
  const sessionId = await getAuthenticatedUserId();
  const admin = createSupabaseAdminClient();
  const { data: sessionData, error: sessionError } = await admin.auth.admin.getUserById(sessionId);
  if (sessionError) throw new Error(sessionError.message);

  const sessionEmail = sessionData.user?.email?.trim() ?? "";
  const accounts = await listAuthAccounts(admin);
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const oldestProfileId = await readOldestProfileId(admin);

  const tables = {} as Record<OwnedTable, Bucket[]>;
  const nulls: OwnedTable[] = [];
  for (const table of TABLES) {
    const counts = await countByUserId(admin, table);
    tables[table] = [...counts.entries()]
      .map(([userId, count]) => ({
        userId,
        count,
        ...classify(userId, sessionId, sessionEmail, accountsById),
      }))
      .sort((left, right) => right.count - left.count);
    if ((counts.get(null) ?? 0) > 0) nulls.push(table);
  }

  const agents = await readAgentOwners(admin);
  const decisions = new Map<string, Bucket["action"]>();
  const reasons = new Map<string, string>();
  for (const table of TABLES) {
    for (const bucket of tables[table]) {
      if (!bucket.userId || bucket.action === "keep") continue;
      const previous = decisions.get(bucket.userId);
      if (previous === "leave" || bucket.action === "leave") decisions.set(bucket.userId, "leave");
      else decisions.set(bucket.userId, "move");
      reasons.set(bucket.userId, bucket.reason);
    }
  }

  return {
    session: { id: sessionId, email: sessionEmail },
    oldestProfileId,
    reads: { agents: "session", chats: "session", webhook: "agents.user_id" },
    authUsers: accounts,
    tables,
    agents,
    plan: {
      targetUserId: sessionId,
      moveFrom: [...decisions.entries()].filter(([, action]) => action === "move").map(([userId]) => userId),
      leave: [...decisions.entries()]
        .filter(([, action]) => action === "leave")
        .map(([userId]) => ({ userId, reason: reasons.get(userId) ?? "другой владелец" })),
      nulls,
    },
  };
}

export async function reassignToSession(confirm: string) {
  const report = await readOwnershipReport();
  if (confirm !== OWNERSHIP_CONFIRM) {
    return { applied: false as const, report };
  }
  if (report.plan.moveFrom.length === 0 && report.plan.nulls.length === 0) {
    return { applied: false as const, report, reason: "Нечего переносить." };
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("id", report.session.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Профиль текущей сессии не найден.");

  const updated: Record<OwnedTable, number> = {
    agents: 0,
    integrations: 0,
    conversations: 0,
    messages: 0,
  };

  for (const table of TABLES) {
    updated[table] = await moveRows(admin, table, report.plan.moveFrom, report.session.id, report.plan.nulls.includes(table));
  }

  return { applied: true as const, updated, report: await readOwnershipReport() };
}

function classify(
  userId: string | null,
  sessionId: string,
  sessionEmail: string,
  accountsById: Map<string, AuthAccount>,
): { action: Bucket["action"]; reason: string } {
  if (!userId) return { action: "move", reason: "user_id пустой" };
  if (userId === sessionId) return { action: "keep", reason: "текущая сессия" };

  const account = accountsById.get(userId);
  if (!account) return { action: "move", reason: "нет пользователя в auth.users" };

  const email = account.email.trim().toLowerCase();
  const current = sessionEmail.trim().toLowerCase();
  if (email && current && email === current) return { action: "move", reason: "тот же email, другой id" };
  if (email === WORKSPACE_EMAIL) return { action: "move", reason: "служебный профиль owner@strike.local" };
  if (!email) return { action: "leave", reason: "в auth.users нет email, владельца не видно" };
  return { action: "leave", reason: `другой email: ${account.email}` };
}

async function listAuthAccounts(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const accounts: AuthAccount[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    for (const user of data.users) {
      accounts.push({
        id: user.id,
        email: user.email ?? "",
        createdAt: user.created_at ?? null,
        lastSignInAt: user.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < 200) break;
  }
  return accounts;
}

async function readOldestProfileId(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await admin.from("profiles").select("id").order("created_at", { ascending: true }).limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0]?.id as string | undefined) ?? null;
}

async function countByUserId(admin: ReturnType<typeof createSupabaseAdminClient>, table: OwnedTable) {
  const counts = new Map<string | null, number>();
  const pageSize = 1000;
  for (let from = 0; from < 100_000; from += pageSize) {
    const { data, error } = await admin.from(table).select("user_id").range(from, from + pageSize - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = data ?? [];
    for (const row of rows) {
      const userId = typeof row.user_id === "string" ? row.user_id : null;
      counts.set(userId, (counts.get(userId) ?? 0) + 1);
    }
    if (rows.length < pageSize) break;
  }
  return counts;
}

async function readAgentOwners(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const { data, error } = await admin.from("agents").select("id, name, user_id").order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: typeof row.name === "string" ? row.name : "",
    userId: typeof row.user_id === "string" ? row.user_id : null,
  }));
}

async function moveRows(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  table: OwnedTable,
  fromIds: string[],
  targetUserId: string,
  includeNulls: boolean,
) {
  let moved = 0;
  if (fromIds.length > 0) {
    const { data, error } = await admin.from(table).update({ user_id: targetUserId }).in("user_id", fromIds).select("id");
    if (error) throw new Error(`${table}: ${error.message}`);
    moved += data?.length ?? 0;
  }
  if (includeNulls) {
    const { data, error } = await admin.from(table).update({ user_id: targetUserId }).is("user_id", null).select("id");
    if (error) throw new Error(`${table}: ${error.message}`);
    moved += data?.length ?? 0;
  }
  return moved;
}
