import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { getProjectSettings } from "@/app/actions/smm-projects";
import { getSmmStudio } from "@/app/actions/smm";
import { getPostForStudio } from "@/app/actions/smm-strategy";
import { StudioEditor } from "@/components/smm/studio-editor";
import { DEFAULT_SMM_PROJECT_SETTINGS } from "@/lib/smm-project-types";
import { EMPTY_SMM_STUDIO } from "@/lib/smm-types";

export const metadata: Metadata = {
  title: "AI-Видеостудия — SMM",
};

type Props = { params: Promise<{ projectId: string }>; searchParams: Promise<{ postId?: string | string[] }> };

export default function Page({ params, searchParams }: Props) {
  return (
    <Suspense fallback={<StudioSkeleton />}>
      <Content params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function StudioSkeleton() {
  return (
    <div className="grid animate-pulse grid-cols-1 gap-8 xl:grid-cols-[1.15fr_1fr]" aria-hidden="true">
      <div className="space-y-6">
        <div className="h-8 w-64 rounded-xl bg-gray-100" />
        <div className="h-56 rounded-3xl bg-gray-100" />
        <div className="h-64 rounded-3xl bg-gray-100" />
        <div className="h-56 rounded-3xl bg-gray-100" />
      </div>
      <div className="h-[640px] rounded-3xl bg-gray-100" />
    </div>
  );
}

async function Content({ params, searchParams }: Props) {
  await io();
  const { projectId } = await params;
  const { postId } = await searchParams;
  const [studioResult, settingsResult, post] = await Promise.all([
    getSmmStudio(projectId),
    getProjectSettings(projectId),
    typeof postId === "string" ? getPostForStudio(projectId, postId) : Promise.resolve(null),
  ]);
  const studio = studioResult.ok ? studioResult.studio : EMPTY_SMM_STUDIO;
  const settings = settingsResult.ok ? settingsResult.settings : DEFAULT_SMM_PROJECT_SETTINGS;
  return (
    <>
      {!studioResult.ok ? <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Не удалось загрузить данные: {studioResult.error}</p> : null}
      <StudioEditor
        key={post?.id ?? "free"}
        projectId={projectId}
        initialCredits={studio.credits}
        initialAvatarId={studio.avatarId}
        post={post}
        brand={{ color: settings.brandColor, font: settings.brandFont }}
      />
    </>
  );
}
