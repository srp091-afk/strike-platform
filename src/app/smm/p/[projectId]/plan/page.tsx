import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { getSmmStudio } from "@/app/actions/smm";
import { PlanTab } from "@/components/smm/smm-view";

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
  const result = await getSmmStudio(projectId);
  return (
    <>
      {!result.ok ? <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Не удалось загрузить данные: {result.error}</p> : null}
      <PlanTab projectId={projectId} initialCredits={result.ok ? result.studio.credits : 0} />
    </>
  );
}
