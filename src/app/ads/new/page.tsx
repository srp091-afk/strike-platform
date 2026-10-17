import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { AdProjectWizard } from "@/components/ad-project-wizard";
import { listCreativeTemplates } from "@/lib/creative-templates";

export const metadata: Metadata = {
  title: "Новая AI-кампания",
};

export default function NewAdProjectPage() {
  return (
    <div className="mx-auto flex h-[calc(100dvh-114px)] w-full max-w-7xl flex-col overflow-hidden px-6 py-4">
      <header className="shrink-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">AI-Кампании</p>
        <h1 className="mt-1 text-3xl font-semibold text-white">Новый проект</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-400">
          Ответьте на вопросы ИИ или загрузите таблицу, затем выберите визуальный стиль.
        </p>
      </header>
      <div className="mt-4 min-h-0 flex-1">
        <Suspense fallback={<div className="h-full rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
          <NewProjectForm />
        </Suspense>
      </div>
    </div>
  );
}

async function NewProjectForm() {
  await io();
  const templates = await listCreativeTemplates();
  return <AdProjectWizard templates={templates} />;
}
