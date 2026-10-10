import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { IntegrationBoard } from "@/components/integration-board";
import { PageFrame } from "@/components/page-frame";
import { listAgents } from "@/lib/agents";
import { listIntegrations } from "@/lib/integrations";
import { listWhatsAppAccounts } from "@/lib/whatsapp-accounts";

export const metadata: Metadata = {
  title: "Интеграции",
};

export default function IntegrationsPage() {
  return (
    <PageFrame
      eyebrow="Каналы"
      title="Интеграции"
      description="Назначьте агента на канал и сохраните ключи доступа."
    >
      <Suspense fallback={<IntegrationSkeleton />}>
        <IntegrationsData />
      </Suspense>
    </PageFrame>
  );
}

async function IntegrationsData() {
  await io();

  try {
    const [agents, integrations, whatsappAccounts] = await Promise.all([
      listAgents(),
      listIntegrations(),
      listWhatsAppAccounts(),
    ]);
    return (
      <IntegrationBoard
        agents={agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          isActive: agent.is_active,
        }))}
        integrations={integrations}
        whatsappAccounts={whatsappAccounts}
        loadError={null}
      />
    );
  } catch (error) {
    return (
      <IntegrationBoard
        agents={[]}
        integrations={[]}
        whatsappAccounts={[]}
        loadError={error instanceof Error ? error.message : "Не удалось загрузить каналы."}
      />
    );
  }
}

function IntegrationSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="h-72 rounded-2xl border border-zinc-200/80 bg-white shadow-sm" />
      ))}
    </div>
  );
}
