import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type PlanId = "free" | "starter" | "pro" | "agency";

/** Лимиты тарифов (null — без лимита). Совпадают с карточками на /pricing. */
export const PLAN_LIMITS: Record<PlanId, { messages: number | null; agents: number | null; campaigns: number | null }> = {
  free: { messages: null, agents: null, campaigns: null },
  starter: { messages: 2500, agents: 3, campaigns: 150 },
  pro: { messages: 10000, agents: 10, campaigns: 500 },
  agency: { messages: 100000, agents: null, campaigns: null },
};

export const PLAN_PRICE_USD: Record<PlanId, number> = { free: 0, starter: 49, pro: 99, agency: 499 };

export type BillingTransaction = {
  id: string;
  createdAt: string;
  description: string;
  method: string;
  amountUsd: number;
  status: string;
};

export type BillingOverview = {
  plan: PlanId;
  subscriptionStatus: string | null;
  renewsAt: string | null;
  balanceUsd: number;
  usage: { messages: number; agents: number; campaigns: number };
  transactions: BillingTransaction[];
};

function planOf(value: unknown): PlanId {
  return value === "starter" || value === "pro" || value === "agency" ? value : "free";
}

function startOfMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getBillingOverview(userId: string): Promise<BillingOverview> {
  const admin = createSupabaseAdminClient();

  const [profile, messages, agents, campaigns, transactions] = await Promise.all([
    admin
      .from("profiles")
      .select("plan, subscription_status, plan_renews_at, balance_usd")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startOfMonthIso()),
    admin.from("agents").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("ad_projects").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin
      .from("billing_transactions")
      .select("id, created_at, description, method, amount_usd, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const failure = profile.error ?? transactions.error;
  if (failure) throw new Error(failure.message);

  return {
    plan: planOf(profile.data?.plan),
    subscriptionStatus: typeof profile.data?.subscription_status === "string" ? profile.data.subscription_status : null,
    renewsAt: typeof profile.data?.plan_renews_at === "string" ? profile.data.plan_renews_at : null,
    balanceUsd: Number(profile.data?.balance_usd ?? 0),
    usage: {
      messages: messages.count ?? 0,
      agents: agents.count ?? 0,
      campaigns: campaigns.count ?? 0,
    },
    transactions: (transactions.data ?? []).map((row) => ({
      id: String(row.id),
      createdAt: String(row.created_at),
      description: String(row.description),
      method: String(row.method),
      amountUsd: Number(row.amount_usd),
      status: String(row.status),
    })),
  };
}
