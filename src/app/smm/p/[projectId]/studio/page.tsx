import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { getSmmStudio } from "@/app/actions/smm";
import { StudioTab } from "@/components/smm/smm-view";
import { EMPTY_SMM_STUDIO } from "@/lib/smm-types";

export const metadata: Metadata = {
  title: "AI-Видеостудия — SMM",
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
  const studio = result.ok ? result.studio : EMPTY_SMM_STUDIO;
  return (
    <>
      {!result.ok ? <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Не удалось загрузить данные: {result.error}</p> : null}
      <StudioTab projectId={projectId} initialAvatarId={studio.avatarId} credits={studio.credits} />
    </>
  );
}
