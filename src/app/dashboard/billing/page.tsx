import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { BillingView, type BillingData } from "@/components/dashboard/billing-view";
import { readAccess } from "@/lib/access";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getBillingOverview } from "@/lib/billing";

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
  const [overview, access] = await Promise.all([getBillingOverview(userId), readAccess(userId)]);

  const data: BillingData = {
    status: overview.subscriptionStatus,
    renewsAt: overview.renewsAt,
    strikeCredits: overview.strikeCredits,
    tiers: overview.tiers,
    isBundleActive: overview.isBundleActive,
    isAdmin: access.isAdmin,
    hasSubscription: overview.hasSubscription,
    transactions: overview.transactions,
  };

  return <BillingView data={data} />;
}
