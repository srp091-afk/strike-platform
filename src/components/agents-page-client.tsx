"use client";

import useSWR from "swr";

import { AgentManager } from "@/components/agent-manager";
import { PageFrame } from "@/components/page-frame";
import type { AgentRecord } from "@/lib/agent-models";
import { jsonFetcher } from "@/lib/swr";

type AgentsResponse = {
  agents: AgentRecord[];
  greenDefaults: { instanceId: string; apiToken: string };
};

function ManagerSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="grid gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-11 animate-pulse rounded-xl bg-[#111]" />
        ))}
      </div>
      <div className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
        <div className="h-10 animate-pulse rounded-xl bg-[#111]" />
        <div className="h-10 w-48 animate-pulse rounded-xl bg-[#111]" />
        <div className="h-64 animate-pulse rounded-xl bg-[#111]" />
      </div>
    </div>
  );
}

export function AgentsPageClient({
  initialAgentId,
  initialConnectChannel,
}: {
  initialAgentId?: string;
  initialConnectChannel?: "whatsapp" | "telegram" | "widget";
} = {}) {
  const { data, error, isLoading, mutate } = useSWR<AgentsResponse>("/api/agents", jsonFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  return (
    <PageFrame
      eyebrow="Настройка"
      title="Агенты"
      description="Системная инструкция #ROLE, модель и имя. Запись сразу попадает в Supabase."
    >
      {isLoading && !data ? (
        <ManagerSkeleton />
      ) : (
        <AgentManager
          agents={data?.agents ?? []}
          initialEditingId={initialAgentId}
          initialConnectChannel={initialConnectChannel}
          greenDefaults={data?.greenDefaults ?? { instanceId: "", apiToken: "" }}
          loadError={error ? error.message : null}
          onSaved={() => {
            void mutate();
          }}
        />
      )}
    </PageFrame>
  );
}
