import type { Metadata } from "next";

import { BillingView } from "@/components/dashboard/billing-view";

export const metadata: Metadata = {
  title: "Биллинг",
};

export default function BillingPage() {
  return <BillingView />;
}
