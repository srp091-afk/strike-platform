import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardCounts } from "@/lib/agents";

export const metadata: Metadata = {
  title: "Дашборд",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardView dialogs={0} />}>
      <LiveDashboard />
    </Suspense>
  );
}

async function LiveDashboard() {
  await io();
  const counts = await getDashboardCounts();
  return <DashboardView dialogs={counts.chats} error={counts.error} />;
}
