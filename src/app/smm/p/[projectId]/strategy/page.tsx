import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { getProjectIdeas } from "@/app/actions/smm-strategy";
import { StrategyBoard } from "@/components/smm/strategy-board";

// Генерация 15 идей моделью может занимать до минуты.
export const maxDuration = 120;

export const metadata: Metadata = {
  title: "Идеи и стратегия — SMM",
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
  const result = await getProjectIdeas(projectId);
  return (
    <>
      {!result.ok ? <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Не удалось загрузить идеи: {result.error}</p> : null}
      <StrategyBoard projectId={projectId} initialIdeas={result.ok ? result.ideas : []} />
    </>
  );
}
