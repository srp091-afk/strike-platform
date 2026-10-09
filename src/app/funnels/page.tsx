import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { FunnelBuilder } from "@/components/funnel-builder";
import { PageFrame } from "@/components/page-frame";
import { listAgents } from "@/lib/agents";

export const metadata: Metadata = {
  title: "Воронки",
};

export default function FunnelsPage() {
  return (
    <PageFrame
      eyebrow="Лидогенерация"
      title="Воронки лидогенерации"
      description="Интерактивные ИИ-воронки с подхватом UTM-меток, Rich-UI виджетами и бесшовным переносом диалога в WhatsApp."
    >
      <Suspense fallback={<div className="h-96 rounded-2xl border border-zinc-200/80 bg-white shadow-sm" />}>
        <FunnelsData />
      </Suspense>
    </PageFrame>
  );
}

async function FunnelsData() {
  await io();

  try {
    const agents = await listAgents();
    return (
      <FunnelBuilder
        agents={agents.filter((agent) => agent.is_active).map((agent) => ({ id: agent.id, name: agent.name }))}
        loadError={null}
      />
    );
  } catch (error) {
    return (
      <FunnelBuilder
        agents={[]}
        loadError={error instanceof Error ? error.message : "Не удалось загрузить агентов."}
      />
    );
  }
}
