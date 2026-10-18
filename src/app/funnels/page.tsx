import type { Metadata } from "next";

import { FunnelsPageClient } from "@/components/funnels-page-client";

export const metadata: Metadata = {
  title: "Сайты",
};

export default function FunnelsPage() {
  return <FunnelsPageClient />;
}
