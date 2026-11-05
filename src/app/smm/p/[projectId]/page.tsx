import { io } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getProjectSettings } from "@/app/actions/smm-projects";

export default function ProjectIndexPage({ params }: { params: Promise<{ projectId: string }> }) {
  return (
    <Suspense fallback={<div className="h-64" />}>
      <Redirector params={params} />
    </Suspense>
  );
}

/** Новый проект (бренд ещё не заполнен) — в настройки бренда, иначе — в стратегию. */
async function Redirector({ params }: { params: Promise<{ projectId: string }> }) {
  await io();
  const { projectId } = await params;
  const result = await getProjectSettings(projectId);
  const isNew = result.ok && !result.settings.toneOfVoice && !result.settings.targetAudience;
  return redirect(`/smm/p/${projectId}/${isNew ? "settings" : "strategy"}`);
}
