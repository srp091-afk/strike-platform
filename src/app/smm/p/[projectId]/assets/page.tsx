import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { getProjectAssets } from "@/app/actions/smm-assets";
import { AssetsGallery } from "@/components/smm/assets-gallery";

export const metadata: Metadata = {
  title: "Медиатека — SMM",
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
  const result = await getProjectAssets(projectId);
  return (
    <>
      {!result.ok ? <p className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Не удалось загрузить медиатеку: {result.error}</p> : null}
      <AssetsGallery initialAssets={result.ok ? result.assets : []} />
    </>
  );
}