import type { Metadata } from "next";

import { AdsPageClient } from "@/components/ads-page-client";

export const metadata: Metadata = {
  title: "Ads & Креативы",
};

export default function AdsPage() {
  return <AdsPageClient />;
}
