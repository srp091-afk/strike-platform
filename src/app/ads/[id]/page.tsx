import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { PageFrame } from "@/components/page-frame";

export const metadata: Metadata = {
  title: "AI-кампания",
};

export default function AdProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageFrame
      eyebrow="AI-Кампании"
      title="Проект создан"
      description="Бриф сохранён. Генератор кампании появится на этом экране."
    >
      <Suspense fallback={<div className="h-48 rounded-2xl border border-dashed border-zinc-300 bg-white shadow-sm" />}>
        <AdProjectStub params={params} />
      </Suspense>
    </PageFrame>
  );
}

async function AdProjectStub({ params }: { params: Promise<{ id: string }> }) {
  await io();
  const { id } = await params;

  return (
    <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm">
      <p className="text-sm text-zinc-500">Кампания для проекта {id} ещё не собрана.</p>
    </section>
  );
}
