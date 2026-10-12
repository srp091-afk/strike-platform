import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { ChatInbox } from "@/components/chat-inbox";
import { PageFrame } from "@/components/page-frame";
import { listAgents } from "@/lib/agents";
import type { ChatAgentOption } from "@/lib/chat-types";
import { listConversations, listMessages } from "@/lib/chats";

export const metadata: Metadata = {
  title: "Чаты",
};

export default function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string | string[]; agentId?: string | string[] }>;
}) {
  return (
    <PageFrame
      eyebrow="Диалоги"
      title="Чаты"
      description="Живые переписки из подключённых каналов. Агента можно остановить в конкретном диалоге."
    >
      <Suspense fallback={<div className="h-[42rem] rounded-2xl border border-zinc-200/80 bg-white shadow-sm" />}>
        <ChatsData searchParams={searchParams} />
      </Suspense>
    </PageFrame>
  );
}

async function ChatsData({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string | string[]; agentId?: string | string[] }>;
}) {
  await io();
  const params = await searchParams;
  const requestedChat = firstParam(params.chat);
  const requestedAgent = firstParam(params.agentId);

  try {
    const agents = (await listAgents()).map(toChatAgentOption);
    const agentId = agents.some((agent) => agent.id === requestedAgent) ? requestedAgent! : "all";
    const threads = await listConversations(agentId === "all" ? null : agentId);
    const chatBelongs = Boolean(requestedChat && threads.some((thread) => thread.id === requestedChat));
    const selectedId = chatBelongs ? requestedChat! : requestedChat ? null : (threads[0]?.id ?? null);
    const messages = selectedId ? await listMessages(selectedId) : [];
    return (
      <ChatInbox
        agents={agents}
        initialAgentId={agentId}
        initialThreads={threads}
        initialMessages={messages}
        initialSelectedId={selectedId}
        loadError={null}
      />
    );
  } catch (error) {
    return (
      <ChatInbox
        agents={[]}
        initialAgentId="all"
        initialThreads={[]}
        initialMessages={[]}
        initialSelectedId={null}
        loadError={error instanceof Error ? error.message : "Не удалось загрузить чаты."}
      />
    );
  }
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toChatAgentOption(agent: Awaited<ReturnType<typeof listAgents>>[number]): ChatAgentOption {
  const channels: ChatAgentOption["channels"] = [];
  if (agent.waIsActive) {
    channels.push({ provider: "whatsapp", label: agent.waPhoneNumber ?? "" });
  }
  if (agent.tgIsActive) {
    const username = agent.tgBotUsername ?? "";
    channels.push({
      provider: "telegram",
      label: username && !username.startsWith("@") ? `@${username}` : username,
    });
  }
  return { id: agent.id, name: agent.name, channels };
}
