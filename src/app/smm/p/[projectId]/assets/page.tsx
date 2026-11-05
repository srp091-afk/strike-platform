import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { EmptySection } from "@/components/smm/smm-view";

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
  void projectId;
  return <EmptySection title="Медиатека" text="Здесь будут храниться сгенерированные видео и загруженные материалы проекта." />;
}
