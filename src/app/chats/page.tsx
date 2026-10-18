import type { Metadata } from "next";

import { ChatsPageClient } from "@/components/chats-page-client";

export const metadata: Metadata = {
  title: "Чаты",
};

export default function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<{ chat?: string | string[]; agentId?: string | string[] }>;
}) {
  return <ChatsPageClient searchParams={searchParams} />;
}
