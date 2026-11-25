import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { PageFrame } from "@/components/page-frame";
import { getEffectiveUserId } from "@/lib/account-context";
import { loadProactiveDesk } from "@/lib/proactive/load";

import { TasksDesk } from "./tasks-desk";

export const metadata: Metadata = { title: "Задачи ИИ" };

export default function AiTasksPage() {
  return (
    <PageFrame eyebrow="Агенты" title="Задачи ИИ" description="Утверждение черновиков, очередь отправки и источники для проактивных кампаний.">
      <Suspense fallback={<div className="h-64 rounded-2xl border border-zinc-800 bg-zinc-900" />}>
        <Desk />
      </Suspense>
    </PageFrame>
  );
}

async function Desk() {
  await io();
  const userId = await getEffectiveUserId();
  const data = await loadProactiveDesk(userId);
  return <TasksDesk {...data} />;
}
