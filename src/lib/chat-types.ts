import type { IntegrationProvider } from "@/lib/integration-catalog";

export type ChatProvider = IntegrationProvider | "unknown";

export type ChatAgentChannel = {
  provider: "whatsapp" | "telegram" | "instagram";
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
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};
