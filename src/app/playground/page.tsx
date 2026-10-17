import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { PageFrame } from "@/components/page-frame";
import { PlaygroundChat } from "@/components/playground-chat";
import { listAgents } from "@/lib/agents";

export const metadata: Metadata = {
  title: "Симулятор",
};

export default function PlaygroundPage({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  return (
    <PageFrame
      eyebrow="Диалог"
      title="Симулятор"
    >
      <Suspense
        fallback={
          <div className="mx-auto flex h-[min(42rem,calc(100dvh-18rem))] max-w-4xl items-center justify-center rounded-2xl border border-zinc-800/50 bg-zinc-900/50 text-sm text-zinc-400">
            Загрузка
          </div>
        }
      >
        <PlaygroundData searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function PlaygroundData({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string | string[] }>;
}) {
  await io();
  const params = await searchParams;
  const requested = Array.isArray(params.agent) ? params.agent[0] : params.agent;

  try {
    const agents = await listAgents();
    return (
      <PlaygroundChat
        agents={agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          model: agent.model,
        }))}
        initialAgentId={requested ?? null}
        loadError={null}
      />
    );
  } catch (error) {
    return (
      <PlaygroundChat
        agents={[]}
        initialAgentId={null}
        loadError={error instanceof Error ? error.message : "Не удалось загрузить агентов."}
      />
    );
  }
}
