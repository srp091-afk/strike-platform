import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { getSmmStrategy } from "@/app/actions/smm";
import { StrategyTab } from "@/components/smm/smm-view";
import { DEFAULT_SMM_STRATEGY } from "@/lib/smm-types";

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
  const result = await getSmmStrategy(projectId);
  return (
    <>
      {!result.ok ? <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Не удалось загрузить настройки: {result.error}</p> : null}
      <StrategyTab projectId={projectId} initial={result.ok ? result.strategy : DEFAULT_SMM_STRATEGY} />
    </>
  );
}
