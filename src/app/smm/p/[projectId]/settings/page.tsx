import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { getProjectSettings } from "@/app/actions/smm-projects";
import { BrandSettingsForm } from "@/components/smm/brand-settings-form";
import { DEFAULT_SMM_PROJECT_SETTINGS } from "@/lib/smm-project-types";

export const metadata: Metadata = {
  title: "Настройки бренда — SMM",
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
  const result = await getProjectSettings(projectId);
  return (
    <>
      {!result.ok ? <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Не удалось загрузить настройки: {result.error}</p> : null}
      <BrandSettingsForm projectId={projectId} initial={result.ok ? result.settings : DEFAULT_SMM_PROJECT_SETTINGS} />
    </>
  );
}
