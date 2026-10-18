"use client";

import { use } from "react";
import useSWR from "swr";

import { ChatInbox } from "@/components/chat-inbox";
import { PageFrame } from "@/components/page-frame";
import type { ChatAgentOption, ChatMessage, ChatThread } from "@/lib/chat-types";
import { jsonFetcher } from "@/lib/swr";

type AgentsResponse = { agents: ChatAgentOption[] };
type InboxResponse = { conversations: ChatThread[]; messages: ChatMessage[] };

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function InboxSkeleton() {
  return (
    <div className="grid h-[42rem] gap-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <div className="grid gap-2 border-r border-zinc-800 p-3">
        <div className="h-10 animate-pulse rounded-xl bg-[#111]" />
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-16 animate-pulse rounded-xl bg-[#111]" />
        ))}
      </div>
      <div className="grid content-start gap-3 p-6">
        <div className="h-8 w-48 animate-pulse rounded-xl bg-[#111]" />
        <div className="h-24 w-2/3 animate-pulse rounded-xl bg-[#111]" />
        <div className="ml-auto h-16 w-1/2 animate-pulse rounded-xl bg-[#111]" />
      </div>
    </div>
  );
}

export function ChatsPageClient({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string | string[]; agentId?: string | string[] }>;
}) {
  const params = use(searchParams);
  const requestedChat = firstParam(params.chat) ?? null;
  const requestedAgent = firstParam(params.agentId) ?? "all";

  const agentsQuery = useSWR<AgentsResponse>("/api/agents?view=chat", jsonFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const agents = agentsQuery.data?.agents ?? [];
  const agentId = agents.some((agent) => agent.id === requestedAgent) ? requestedAgent : "all";

  const inboxKey =
    agentsQuery.data || agentsQuery.error
      ? `/api/chats?agentId=${encodeURIComponent(agentId)}${requestedChat ? `&conversation=${encodeURIComponent(requestedChat)}` : ""}`
      : null;

  const inboxQuery = useSWR<InboxResponse>(inboxKey, jsonFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  const threads = inboxQuery.data?.conversations ?? [];
  const chatBelongs = Boolean(requestedChat && threads.some((thread) => thread.id === requestedChat));
  const selectedId = chatBelongs ? requestedChat : requestedChat ? null : (threads[0]?.id ?? null);
  const messages = selectedId && chatBelongs ? (inboxQuery.data?.messages ?? []) : [];

  const booting = (agentsQuery.isLoading && !agentsQuery.data) || (Boolean(inboxKey) && inboxQuery.isLoading && !inboxQuery.data);
  const loadError = agentsQuery.error?.message ?? inboxQuery.error?.message ?? null;

  return (
    <PageFrame
      eyebrow="Диалоги"
      title="Чаты"
      description="Живые переписки из подключённых каналов. Агента можно остановить в конкретном диалоге."
    >
      {booting ? (
        <InboxSkeleton />
      ) : (
        <ChatInbox
          agents={agents}
          initialAgentId={agentId}
          initialThreads={threads}
          initialMessages={messages}
          initialSelectedId={selectedId}
          loadError={loadError}
        />
      )}
    </PageFrame>
  );
}
