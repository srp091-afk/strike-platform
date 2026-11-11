"use client";

import Link from "next/link";
import useSWR from "swr";

import { CampaignStatusBadge } from "@/components/outreach/outreach-ui";
import { OutreachMonitor } from "@/components/outreach/outreach-monitor";
import { OutreachSettings } from "@/components/outreach/outreach-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { OutreachAgentOption, OutreachCampaign, OutreachCounts, OutreachLog } from "@/lib/outreach-types";
import { jsonFetcher } from "@/lib/swr";

export type CampaignState = {
  campaign: OutreachCampaign;
  logs: OutreachLog[];
  counts: OutreachCounts;
};

export function OutreachWorkspace({ initial, agents }: { initial: CampaignState; agents: OutreachAgentOption[] }) {
  const id = initial.campaign.id;
  // Живое обновление мониторинга: пока рассылка в работе, опрашиваем состояние раз в 4 секунды.
  const { data, mutate } = useSWR<CampaignState>(`/api/leads/${id}`, jsonFetcher, {
    fallbackData: initial,
    revalidateOnFocus: false,
    refreshInterval: (latest) => (latest?.campaign.status === "active" ? 4000 : 0),
  });
  const state = data ?? initial;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <Link href="/leads" className="text-sm text-zinc-400 hover:text-white">
        ← Все кампании
      </Link>
      <header className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold text-white">{state.campaign.name}</h1>
        <CampaignStatusBadge status={state.campaign.status} />
      </header>

      <Tabs defaultValue="settings" className="mt-8">
        <TabsList className="max-w-md">
          <TabsTrigger value="settings">Настройки</TabsTrigger>
          <TabsTrigger value="monitoring">Мониторинг</TabsTrigger>
        </TabsList>
        <TabsContent value="settings">
          <OutreachSettings
            key={state.campaign.id}
            campaign={state.campaign}
            total={state.counts.total}
            logs={state.logs}
            agents={agents}
            onChanged={() => void mutate()}
          />
        </TabsContent>
        <TabsContent value="monitoring">
          <OutreachMonitor campaign={state.campaign} logs={state.logs} counts={state.counts} onChanged={() => void mutate()} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
