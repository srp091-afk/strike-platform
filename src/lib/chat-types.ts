import type { IntegrationProvider } from "@/lib/integration-catalog";

export type ChatProvider = IntegrationProvider | "unknown";

export type ChatAgentChannel = {
  provider: IntegrationProvider;
  label: string;
};

export type ChatAgentOption = {
  id: string;
  name: string;
  channels: ChatAgentChannel[];
};

export type ChatThread = {
  id: string;
  agentId: string | null;
  title: string;
  handle: string;
  provider: ChatProvider;
  preview: string;
  lastMessageAt: string | null;
  botActive: boolean;
  /** Имя оператора виджета. У остальных каналов пусто. */
  operatorName: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};
