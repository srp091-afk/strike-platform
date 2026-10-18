import type { Metadata } from "next";

import { AdsPageClient } from "@/components/ads-page-client";

export const metadata: Metadata = {
  title: "AI-Кампании",
};

export default function AdsPage() {
  return <AdsPageClient />;
}
