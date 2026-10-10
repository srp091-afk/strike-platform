import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { AgentManager } from "@/components/agent-manager";
import { PageFrame } from "@/components/page-frame";
import { listAgents } from "@/lib/agents";
import { readOptionalGreenCredentials } from "@/lib/green-api";

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
      <Suspense
        fallback={<div className="h-40 rounded-2xl border border-zinc-200/80 bg-white shadow-sm" />}
      >
        <AgentsData />
      </Suspense>
    </PageFrame>
  );
}

async function AgentsData() {
  await io();

  try {
    const agents = await listAgents();
    return <AgentManager agents={agents} greenDefaults={readOptionalGreenCredentials()} loadError={null} />;
  } catch (error) {
    return (
      <AgentManager
        agents={[]}
        greenDefaults={readOptionalGreenCredentials()}
        loadError={error instanceof Error ? error.message : "Не удалось загрузить агентов."}
      />
    );
  }
}
