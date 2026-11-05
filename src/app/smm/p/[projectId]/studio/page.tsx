import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { getSmmStudio } from "@/app/actions/smm";
import { getPostForStudio } from "@/app/actions/smm-strategy";
import { StudioPostPanel, StudioTab } from "@/components/smm/smm-view";
import { EMPTY_SMM_STUDIO } from "@/lib/smm-types";

export const metadata: Metadata = {
  title: "AI-Видеостудия — SMM",
};

export default function Page({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ postId?: string | string[] }> }) {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Content({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ postId?: string | string[] }> }) {
  await io();
  const { projectId } = await params;
  const { postId } = await searchParams;
  const result = await getSmmStudio(projectId);
  const post = typeof postId === "string" ? await getPostForStudio(projectId, postId) : null;
  const studio = result.ok ? result.studio : EMPTY_SMM_STUDIO;
  return (
    <>
      {!result.ok ? <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Не удалось загрузить данные: {result.error}</p> : null}
      {post ? <StudioPostPanel projectId={projectId} title={post.title} script={post.script} initialCredits={studio.credits} /> : null}
      <StudioTab projectId={projectId} initialAvatarId={studio.avatarId} credits={studio.credits} />
    </>
  );
}
