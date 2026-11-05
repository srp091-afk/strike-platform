import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { getScheduledPosts } from "@/app/actions/smm-plan";
import { PlanFeed } from "@/components/smm/plan-feed";

export const metadata: Metadata = {
  title: "Контент-план — SMM",
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
  const result = await getScheduledPosts(projectId);
  return (
    <>
      {!result.ok ? <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Не удалось загрузить расписание: {result.error}</p> : null}
      <PlanFeed projectId={projectId} initialPosts={result.ok ? result.posts : []} />
    </>
  );
}
