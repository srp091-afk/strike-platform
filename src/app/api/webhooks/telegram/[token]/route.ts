import type { NextRequest } from "next/server";

import { readMessageLimit } from "@/lib/agent-models";
import { pauseIfDialogueOverLimit, readBotFlags } from "@/lib/bot-state";
import { getOpenAI } from "@/lib/openai";
import { replyChunks, systemPromptWithSplit } from "@/lib/reply";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 120;

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token: rawToken } = await context.params;
    const token = decodeURIComponent(rawToken);
    const body = await request.json();
    await handleUpdate(token, body);
  } catch (error) {
    console.error("[telegram webhook]", error instanceof Error ? error.message : error);
  }

  return Response.json({ ok: true });
}

async function handleUpdate(token: string, body: unknown) {
  const message = readMessage(body);
  if (!message) return;

  const supabase = createSupabaseAdminClient();
  const { data: agent, error } = await supabase
    .from("agents")
    .select(
      "id, user_id, system_prompt, model, temperature, is_active, active_channels, response_delay, split_messages, limit_agent_messages, limit_client_messages, limit_total_messages, tg_bot_token, tg_is_active",
    )
    .eq("tg_bot_token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!agent?.user_id || !agent.tg_bot_token) return;

  const externalId = `tg:${message.messageId}`;
  const { data: duplicate, error: duplicateError } = await supabase
    .from("messages")
    .select("id")
    .eq("external_message_id", externalId)
    .limit(1);
  if (duplicateError) throw new Error(duplicateError.message);
  if (duplicate && duplicate.length > 0) return;

  const integrationId = await ensureTelegramIntegration(supabase, {
    userId: String(agent.user_id),
    agentId: String(agent.id),
  });
  const conversation = await upsertConversation(supabase, {
    userId: String(agent.user_id),
    agentId: String(agent.id),
    integrationId,
    externalChatId: message.chatId,
    contactName: message.contactName,
    preview: message.text,
  });

  const { error: inboundError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: message.text,
    status: "sent",
    external_message_id: externalId,
  });
  if (inboundError) throw new Error(inboundError.message);

  const channelOn =
    !agent.active_channels ||
    typeof agent.active_channels !== "object" ||
    Array.isArray(agent.active_channels) ||
    (agent.active_channels as { telegram?: unknown }).telegram !== false;

  if (agent.tg_is_active !== true || agent.is_active !== true || !channelOn) return;
  if (!conversation.botActive) {
    const { data: pause } = await supabase
      .from("conversations")
      .select("bot_paused_until")
      .eq("id", conversation.id)
      .maybeSingle();
    const until = pause?.bot_paused_until ? String(pause.bot_paused_until) : "неизвестно";
    console.log(`Остановка: чат на паузе до ${until}`);
    return;
  }
  if (
    await pauseIfDialogueOverLimit(supabase, conversation.id, {
      agent: readMessageLimit(agent.limit_agent_messages),
      client: readMessageLimit(agent.limit_client_messages),
      total: readMessageLimit(agent.limit_total_messages),
    })
  ) {
    console.log("Остановка: превышен лимит сообщений");
    return;
  }

  const { data: history, error: historyError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(40);
  if (historyError) throw new Error(historyError.message);

  const dialogue = (history ?? [])
    .reverse()
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({
      role: item.role as "user" | "assistant",
      content: item.content as string,
    }));

  const model = (agent.model as string) || "gpt-4o-mini";
  const completion = await getOpenAI().chat.completions.create({
    model,
    temperature: model.includes("gpt-6") ? 1 : clampTemperature(agent.temperature),
    messages: [
      {
        role: "system",
        content: systemPromptWithSplit(
          (agent.system_prompt as string) || "You are a STRIKE agent.",
          agent.split_messages,
        ),
      },
      ...dialogue,
    ],
  });

  const reply = completion.choices[0]?.message?.content?.trim() ?? "";
  if (!reply) return;

  const responseDelay = Number(agent.response_delay);
  const chunks = replyChunks(reply, agent.split_messages);
  let preview = chunks[0] ?? reply;

  for (const chunk of chunks) {
    let delivered = false;
    try {
      if (responseDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, responseDelay * 1000));
      }
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: message.chatId, text: chunk }),
        signal: AbortSignal.timeout(20000),
      });
      delivered = response.ok;
    } catch (sendError) {
      console.error("[telegram webhook] send", sendError instanceof Error ? sendError.message : sendError);
    }

    const { error: storedError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: chunk,
      status: delivered ? "sent" : "failed",
    });
    if (storedError) throw new Error(storedError.message);
    preview = chunk;
    if (!delivered) break;
  }

  await supabase
    .from("conversations")
    .update({
      last_message_preview: preview.slice(0, 140),
      last_message_at: new Date().toISOString(),
      agent_id: agent.id,
    })
    .eq("id", conversation.id);
}

function readMessage(body: unknown) {
  const record = asRecord(body);
  const message = asRecord(record.message);
  const chat = asRecord(message.chat);
  const from = asRecord(message.from);
  const text = stringValue(message.text).slice(0, 8000);
  const chatId = stringValue(chat.id);
  const messageId = stringValue(message.message_id);
  if (!text || !chatId || !messageId) return null;
  const name = [stringValue(from.first_name), stringValue(from.last_name)].filter(Boolean).join(" ");
  return { chatId, messageId, text, contactName: name || null };
}

async function ensureTelegramIntegration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: { userId: string; agentId: string },
) {
  const externalId = `tg:${input.agentId}`;
  const { data: existing, error: lookupError } = await supabase
    .from("integrations")
    .select("id")
    .eq("provider", "telegram")
    .eq("external_id", externalId)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing?.id) {
    await supabase.from("integrations").update({ agent_id: input.agentId, status: "connected" }).eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("integrations")
    .insert({
      user_id: input.userId,
      agent_id: input.agentId,
      provider: "telegram",
      name: "Telegram",
      status: "connected",
      external_id: externalId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось привязать Telegram.");
  return data.id as string;
}

async function upsertConversation(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    userId: string;
    agentId: string;
    integrationId: string;
    externalChatId: string;
    contactName: string | null;
    preview: string;
  },
) {
  const { data: existing, error: lookupError } = await supabase
    .from("conversations")
    .select("id")
    .eq("integration_id", input.integrationId)
    .eq("external_chat_id", input.externalChatId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const patch = {
    user_id: input.userId,
    agent_id: input.agentId,
    last_message_preview: input.preview.slice(0, 140),
    last_message_at: new Date().toISOString(),
    ...(input.contactName ? { contact_name: input.contactName } : {}),
  };

  if (existing?.id) {
    const { error } = await supabase.from("conversations").update(patch).eq("id", existing.id);
    if (error) throw new Error(error.message);
    const flags = await readBotFlags(supabase, [existing.id as string]);
    return { id: existing.id as string, botActive: flags.get(existing.id as string) ?? true };
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({ ...patch, integration_id: input.integrationId, external_chat_id: input.externalChatId })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось создать диалог.");
  return { id: data.id as string, botActive: true };
}

function clampTemperature(value: unknown) {
  const temperature = Number(value);
  if (!Number.isFinite(temperature)) return 0.7;
  return Math.min(2, Math.max(0, temperature));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}
