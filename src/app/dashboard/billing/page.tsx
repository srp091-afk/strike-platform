import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { BillingView, type BillingData } from "@/components/dashboard/billing-view";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getBillingOverview, PLAN_LIMITS, PLAN_PRICE_USD } from "@/lib/billing";

export const metadata: Metadata = {
  title: "Биллинг",
};

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="h-[640px] bg-black" />}>
      <LiveBilling />
    </Suspense>
  );
}

async function LiveBilling() {
  await io();
  const userId = await getAuthenticatedUserId();
  const overview = await getBillingOverview(userId);
  const limits = PLAN_LIMITS[overview.plan];

  const data: BillingData = {
    plan: overview.plan,
    priceUsd: PLAN_PRICE_USD[overview.plan],
    status: overview.subscriptionStatus,
    renewsAt: overview.renewsAt,
    balanceUsd: overview.balanceUsd,
    usage: [
      { key: "messages", used: overview.usage.messages, limit: limits.messages },
      { key: "agents", used: overview.usage.agents, limit: limits.agents },
      { key: "campaigns", used: overview.usage.campaigns, limit: limits.campaigns },
    ],
    transactions: overview.transactions,
  };

  return <BillingView data={data} />;
}
