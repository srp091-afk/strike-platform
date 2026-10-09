import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { AgentManager } from "@/components/agent-manager";
import { PageFrame } from "@/components/page-frame";
import { listAgents } from "@/lib/agents";

export const metadata: Metadata = {
  title: "Агенты",
};

export default function AgentsPage() {
  return (
    <PageFrame
      eyebrow="Настройка"
      title="Агенты"
      description="Системная инструкция #ROLE, модель и имя. Запись сразу попадает в Supabase."
    >
      <Suspense fallback={<p className="border border-black px-4 py-6 text-sm uppercase tracking-[0.16em]">Загрузка</p>}>
        <AgentsData />
      </Suspense>
    </PageFrame>
  );
}

async function AgentsData() {
  await io();

  try {
    const agents = await listAgents();
    return <AgentManager agents={agents} loadError={null} />;
  } catch (error) {
    return (
      <AgentManager
        agents={[]}
        loadError={error instanceof Error ? error.message : "Не удалось загрузить агентов."}
      />
    );
  }
}
