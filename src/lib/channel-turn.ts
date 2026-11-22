import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeAgentModel } from "@/lib/agent-models";
import { withKnowledge } from "@/lib/knowledge";
import { completeWithNotifyManager } from "@/lib/notify-manager";
import { stripMarkdown, systemPromptWithSplit } from "@/lib/reply";
import { interpolatePrompt } from "@/lib/utils/prompt-parser";

type Admin = SupabaseClient;

export async function completeChannelReply(input: {
  supabase: Admin;
  agent: { id: string; system_prompt: string | null; model: string | null; temperature: number | null; split_messages: boolean | null };
  conversationId: string;
  channel: "viber" | "email" | "messenger";
  chatId: string;
  clientName: string | null;
  question: string;
}) {
  const { data: history, error } = await input.supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);

  const dialogue = (history ?? [])
    .reverse()
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({ role: item.role as "user" | "assistant", content: String(item.content ?? "") }));

  const model = normalizeAgentModel(input.agent.model);
  const clientName = input.clientName?.trim() || input.chatId;
  const completion = await completeWithNotifyManager({
    model,
    temperature: model.includes("gpt-6") ? 1 : clampTemperature(input.agent.temperature),
    messages: [
      {
        role: "system",
        content: await withKnowledge(
          systemPromptWithSplit(
            interpolatePrompt(input.agent.system_prompt || "You are a STRIKE agent.", {
              source: input.channel,
              client_name: clientName,
              ...(input.channel === "email" ? { client_email: input.chatId } : {}),
            }),
            input.agent.split_messages,
          ),
          String(input.agent.id),
          input.question,
        ),
      },
      ...dialogue,
    ],
    chat: {
      supabase: input.supabase,
      conversationId: input.conversationId,
      agentId: String(input.agent.id),
      channel: input.channel,
      clientHandle: input.chatId,
      clientName,
    },
    delivery: {
      channel: input.channel,
      chatId: input.chatId,
      client: { name: clientName, ...(input.channel === "email" ? { username: input.chatId } : {}) },
    },
  });

  return { text: stripMarkdown(completion.text).trim(), paused: completion.pausedByTool };
}

function clampTemperature(value: unknown) {
  const temperature = Number(value);
  if (!Number.isFinite(temperature)) return 0.7;
  return Math.min(2, Math.max(0, temperature));
}
