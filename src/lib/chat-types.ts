import type { IntegrationProvider } from "@/lib/integration-catalog";

export type ChatProvider = IntegrationProvider | "unknown";

export type ChatThread = {
  id: string;
  title: string;
  handle: string;
  provider: ChatProvider;
  preview: string;
  lastMessageAt: string | null;
  botActive: boolean;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};
