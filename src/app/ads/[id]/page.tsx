import type { Metadata } from "next";

import { PageFrame } from "@/components/page-frame";

export const metadata: Metadata = {
  title: "AI-кампания",
};

export default async function AdProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <PageFrame
      eyebrow="AI-Кампании"
      title="Проект создан"
      description="Бриф сохранён. Генератор кампании появится на этом экране."
    >
      <section className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm">
        <p className="text-sm text-zinc-500">Кампания для проекта {id} ещё не собрана.</p>
      </section>
    </PageFrame>
  );
}
