import type { Metadata } from "next";

import { PricingView } from "@/components/pricing/pricing-view";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Simple, transparent pricing for the STRIKE AI sales platform. Start pay-as-you-go and scale on your terms.",
};

export default function PricingPage() {
  return <PricingView />;
}
