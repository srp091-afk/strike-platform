import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { AgentManager } from "@/components/agent-manager";
import { PageFrame } from "@/components/page-frame";
import { listAgents } from "@/lib/agents";
import { listWhatsAppAccounts } from "@/lib/whatsapp-accounts";

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
    const [agents, whatsappAccounts] = await Promise.all([listAgents(), listWhatsAppAccounts()]);
    return <AgentManager agents={agents} whatsappAccounts={whatsappAccounts} loadError={null} />;
  } catch (error) {
    return (
      <AgentManager
        agents={[]}
        whatsappAccounts={[]}
        loadError={error instanceof Error ? error.message : "Не удалось загрузить агентов."}
      />
    );
  }
}
