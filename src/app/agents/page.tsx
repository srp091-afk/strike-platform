import type { Metadata } from "next";

import { AgentsPageClient } from "@/components/agents-page-client";

export const metadata: Metadata = {
  title: "Агенты",
};

export default function AgentsPage() {
  return <AgentsPageClient />;
}
