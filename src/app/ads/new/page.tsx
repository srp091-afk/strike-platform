import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { AdProjectWizard } from "@/components/ad-project-wizard";
import { PageFrame } from "@/components/page-frame";
import { listCreativeTemplates } from "@/lib/creative-templates";

export const metadata: Metadata = {
  title: "Новая AI-кампания",
};

export default function NewAdProjectPage() {
  return (
    <PageFrame
      eyebrow="AI-Кампании"
      title="Новый проект"
      description="Ответьте на вопросы ИИ или загрузите таблицу, затем выберите визуальный стиль."
    >
      <Suspense fallback={<div className="mx-auto h-80 max-w-5xl rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
        <NewProjectForm />
      </Suspense>
    </PageFrame>
  );
}

async function NewProjectForm() {
  await io();
  const templates = await listCreativeTemplates();
  return <AdProjectWizard templates={templates} />;
}
