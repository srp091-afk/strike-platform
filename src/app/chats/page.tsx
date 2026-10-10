import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { ChatInbox } from "@/components/chat-inbox";
import { PageFrame } from "@/components/page-frame";
import { listConversations, listMessages } from "@/lib/chats";

export const metadata: Metadata = {
  title: "Чаты",
};

export default function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string | string[] }>;
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
  searchParams: Promise<{ chat?: string | string[] }>;
}) {
  await io();
  const params = await searchParams;
  const requested = Array.isArray(params.chat) ? params.chat[0] : params.chat;

  try {
    const threads = await listConversations();
    const selectedId = threads.some((thread) => thread.id === requested) ? requested! : (threads[0]?.id ?? null);
    const messages = selectedId ? await listMessages(selectedId) : [];
    return (
      <ChatInbox
        initialThreads={threads}
        initialMessages={messages}
        initialSelectedId={selectedId}
        loadError={null}
      />
    );
  } catch (error) {
    return (
      <ChatInbox
        initialThreads={[]}
        initialMessages={[]}
        initialSelectedId={null}
        loadError={error instanceof Error ? error.message : "Не удалось загрузить чаты."}
      />
    );
  }
}
