import type { Metadata } from "next";

import { AgentsPageClient } from "@/components/agents-page-client";
import { creditsAreExhausted } from "@/components/credits-notice";

export const metadata: Metadata = {
  title: "Агенты",
};

export default async function AgentsPage() {
  const creditsExhausted = await creditsAreExhausted();
  return <AgentsPageClient creditsExhausted={creditsExhausted} />;
}
