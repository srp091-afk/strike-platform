import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { LockedModuleOverlay } from "@/components/locked-module";
import { PageFrame } from "@/components/page-frame";
import { canUseAssistantPro } from "@/lib/assistant-pro";
import { getEffectiveUserId } from "@/lib/account-context";
import { loadProactiveDesk } from "@/lib/proactive/load";

import { TasksDesk } from "./tasks-desk";

export const metadata: Metadata = { title: "Ассистент Pro" };

export default async function AiTasksPage() {
  if (!(await canUseAssistantPro())) return <LockedModuleOverlay href="/billing" />;
  return (
    <PageFrame eyebrow="Агенты" title="Ассистент Pro" description="Утверждение черновиков, очередь отправки и источники для проактивных кампаний.">
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
