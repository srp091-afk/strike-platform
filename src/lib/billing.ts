import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type BillingTransaction = {
  id: string;
  createdAt: string;
  description: string;
  method: string;
  amountUsd: number;
  credits: number | null;
  status: string;
};

export type BillingOverview = {
  subscriptionStatus: string | null;
  renewsAt: string | null;
  subscriptionEndsAt: string | null;
  balanceUsd: number;
  strikeCredits: number;
  tiers: { agents: string; smm: string; ads: string; sites: string };
  isBundleActive: boolean;
  usage: { messages: number; agents: number; campaigns: number; sites: number };
  /** Есть покупатель или подписка Paddle: можно открыть портал управления. */
  hasSubscription: boolean;
  transactions: BillingTransaction[];
};

function startOfMonthIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function getBillingOverview(userId: string): Promise<BillingOverview> {
  const admin = createSupabaseAdminClient();

  // Колонки STRIKE Credits из миграции 20261106_user_credits_tiers: до её применения используем значения по умолчанию.
  const creditsQuery = await admin
    .from("profiles")
    .select("strike_credits, tier_agents, tier_smm, tier_sites, is_bundle_active")
    .eq("id", userId)
    .maybeSingle();
  const credits = creditsQuery.error ? null : creditsQuery.data;
  // tier_ads — отдельная миграция (20261106_add_tier_ads): отдельный запрос, чтобы её отсутствие не ломало остальное.
  const adsQuery = await admin.from("profiles").select("tier_ads").eq("id", userId).maybeSingle();
  const tierAds = adsQuery.error ? "trial" : String(adsQuery.data?.tier_ads ?? "trial");
  const endsQuery = await admin.from("profiles").select("subscription_ends_at").eq("id", userId).maybeSingle();
  const subscriptionEndsAt =
    endsQuery.error || typeof endsQuery.data?.subscription_ends_at !== "string" ? null : endsQuery.data.subscription_ends_at;
  const paddleQuery = await admin.from("profiles").select("paddle_customer_id, paddle_subscription_id").eq("id", userId).maybeSingle();
  const paddleCustomerId = paddleQuery.error ? "" : String(paddleQuery.data?.paddle_customer_id ?? "");
  const paddleSubscriptionId = paddleQuery.error ? "" : String(paddleQuery.data?.paddle_subscription_id ?? "");

  const [profile, messages, agents, campaigns, sites, transactions] = await Promise.all([
    admin
      .from("profiles")
      .select("subscription_status, plan_renews_at, balance_usd")
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", startOfMonthIso()),
    admin.from("agents").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("ad_projects").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("landings").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin
      .from("billing_transactions")
      .select("id, created_at, description, method, payment_method, amount, amount_usd, status, credits")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const tolerable = Boolean(transactions.error && /credits|payment_method|amount/.test(transactions.error.message));
  const failure = profile.error ?? (transactions.error && !tolerable ? transactions.error : null);
  const rows = transactions.error
    ? (
        await admin
          .from("billing_transactions")
          .select("id, created_at, description, method, amount_usd, status")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20)
      ).data
    : transactions.data;
  if (failure) throw new Error(failure.message);

  return {
    subscriptionStatus: typeof profile.data?.subscription_status === "string" ? profile.data.subscription_status : null,
    renewsAt: typeof profile.data?.plan_renews_at === "string" ? profile.data.plan_renews_at : null,
    subscriptionEndsAt,
    balanceUsd: Number(profile.data?.balance_usd ?? 0),
    strikeCredits: Number(credits?.strike_credits ?? 500),
    tiers: {
      agents: String(credits?.tier_agents ?? "trial"),
      smm: String(credits?.tier_smm ?? "trial"),
      ads: tierAds,
      sites: String(credits?.tier_sites ?? "trial"),
    },
    isBundleActive: Boolean(credits?.is_bundle_active),
    usage: {
      messages: messages.count ?? 0,
      agents: agents.count ?? 0,
      campaigns: campaigns.count ?? 0,
      sites: sites.count ?? 0,
    },
    hasSubscription: Boolean(paddleCustomerId || paddleSubscriptionId),
    transactions: (rows ?? []).map((row) => {
      const record = row as {
        id: unknown;
        created_at: unknown;
        description: unknown;
        method: unknown;
        payment_method?: unknown;
        amount?: unknown;
        amount_usd: unknown;
        status: unknown;
        credits?: unknown;
      };
      const paidAmount = record.amount ?? record.amount_usd;
      const credits = Number(record.credits);
      return {
        id: String(record.id),
        createdAt: String(record.created_at),
        description: String(record.description),
        method: String(record.payment_method || record.method),
        amountUsd: Number(paidAmount ?? 0),
        credits: Number.isFinite(credits) ? credits : null,
        status: String(record.status).toLowerCase(),
      };
    }),
  };
}
