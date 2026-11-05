import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { ConnectionsTab } from "@/components/smm/smm-view";

export const metadata: Metadata = {
  title: "Интеграции — SMM",
};

export default function Page({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ projectId: string }> }) {
  await io();
  const { projectId } = await params;
  void projectId;
  return <ConnectionsTab />;
}
