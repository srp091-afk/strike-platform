import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardData } from "@/lib/dashboard-data";

export const metadata: Metadata = {
  title: "Дашборд",
};

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardView data={null} />}>
      <LiveDashboard />
    </Suspense>
  );
}

async function LiveDashboard() {
  await io();
  const data = await getDashboardData();
  return <DashboardView data={data} />;
}
