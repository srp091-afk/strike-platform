import type { Metadata } from "next";

import { AgentsPageClient } from "@/components/agents-page-client";

export const metadata: Metadata = {
  title: "Агенты",
};

/**
 * Глубокая ссылка на редактирование агента: /agents/<id>.
 * Сюда ведёт router.replace после автосохранения нового агента перед
 * подключением канала (?connect=whatsapp|telegram открывает нужную модалку).
 */
export default async function AgentByIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const connect =
    query.connect === "whatsapp" || query.connect === "telegram" || query.connect === "widget" ? query.connect : undefined;

  return <AgentsPageClient initialAgentId={id} initialConnectChannel={connect} />;
}
