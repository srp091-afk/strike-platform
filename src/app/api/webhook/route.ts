import type { NextRequest } from "next/server";

import { readBotFlags } from "@/lib/bot-state";
import { deliverChunk } from "@/lib/deliver";
import { getOpenAI } from "@/lib/openai";
import { replyChunks, sleep } from "@/lib/reply";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IncomingMessage = {
  integrationId: string;
  externalChatId: string;
  text: string;
  contactName: string | null;
  externalMessageId: string | null;
};

export async function GET() {
  return Response.json({ ok: true });
}

export async function POST(request: NextRequest) {
  let body: unknown = {};
  const raw = await request.text();
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "Некорректный JSON." }, { status: 400 });
    }
  }

  const incoming = parseIncoming(request.nextUrl, body);
  if ("error" in incoming) {
    return Response.json({ error: incoming.error }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: integration, error: integrationError } = await supabase
    .from("integrations")
    .select("id, user_id, agent_id, provider, status")
    .eq("id", incoming.integrationId)
    .maybeSingle();

  if (integrationError) {
    return Response.json({ error: integrationError.message }, { status: 500 });
  }

  if (!integration) {
    return Response.json({ error: "Интеграция не найдена." }, { status: 404 });
  }

  if (integration.status !== "connected") {
    return Response.json({ error: "Интеграция выключена." }, { status: 409 });
  }

  if (!integration.agent_id) {
    return Response.json({ error: "К интеграции не привязан агент." }, { status: 409 });
  }

  const { data: agent, error: agentError } = await loadWebhookAgent(
    supabase,
    integration.agent_id as string,
  );

  if (agentError) {
    return Response.json({ error: agentError.message }, { status: 500 });
  }

  if (!agent || !agent.is_active) {
    return Response.json({ error: "Агент не найден или выключен." }, { status: 409 });
  }

  let conversationId: string;
  let botActive = true;
  try {
    const conversation = await upsertConversation(supabase, {
      userId: integration.user_id as string,
      agentId: agent.id as string,
      integrationId: integration.id as string,
      externalChatId: incoming.externalChatId,
      contactName: incoming.contactName,
      preview: incoming.text,
    });
    conversationId = conversation.id;
    botActive = conversation.botActive;
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Не удалось создать диалог." },
      { status: 500 },
    );
  }

  const { error: inboundError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: incoming.text,
    status: "sent",
    external_message_id: incoming.externalMessageId,
  });

  if (inboundError) {
    return Response.json({ error: inboundError.message }, { status: 500 });
  }

  if (!botActive) {
    return Response.json({ ok: true, paused: true });
  }

  const { data: history, error: historyError } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(40);

  if (historyError) {
    return Response.json({ error: historyError.message }, { status: 500 });
  }

  const dialogue = (history ?? [])
    .reverse()
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content as string,
    }));

  let reply = "";
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: (agent.model as string) || "gpt-4o-mini",
      temperature: clampTemperature(agent.temperature),
      messages: [
        {
          role: "system",
          content: (agent.system_prompt as string) || "You are a STRIKE agent.",
        },
        ...dialogue,
      ],
    });
    reply = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "OpenAI request failed." },
      { status: 502 },
    );
  }

  if (!reply) {
    return Response.json({ error: "Модель вернула пустой ответ." }, { status: 502 });
  }

  const chunks = replyChunks(reply, agent.split_messages);
  const chunkGroupId = crypto.randomUUID();
  const { data: secrets } = await supabase
    .from("integration_secrets")
    .select("credentials")
    .eq("integration_id", integration.id)
    .maybeSingle();

  const credentials = asCredentials(secrets?.credentials);
  const sent = [];

  for (let index = 0; index < chunks.length; index += 1) {
    if (index > 0) {
      await sleep(2000);
    }

    const content = chunks[index];
    let delivery: { delivered: boolean; detail: string };
    try {
      delivery = await deliverChunk({
        provider: integration.provider as string,
        externalChatId: incoming.externalChatId,
        text: content,
        credentials,
      });
    } catch {
      delivery = { delivered: false, detail: "delivery_error" };
    }

    const channelRejected =
      delivery.detail === "delivery_error" ||
      /^(telegram|whatsapp|instagram)_\d+$/.test(delivery.detail);
    const { error: outboundError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content,
      chunk_index: index,
      chunk_group_id: chunkGroupId,
      status: delivery.delivered || !channelRejected ? "sent" : "failed",
    });

    if (outboundError) {
      return Response.json({ error: outboundError.message }, { status: 500 });
    }

    sent.push({
      index,
      content,
      delivered: delivery.delivered,
      detail: delivery.detail,
    });
  }

  const lastChunk = chunks[chunks.length - 1] ?? reply;
  await supabase
    .from("conversations")
    .update({
      last_message_preview: lastChunk.slice(0, 140),
      last_message_at: new Date().toISOString(),
      agent_id: agent.id,
    })
    .eq("id", conversationId);

  return Response.json({
    ok: true,
    conversation_id: conversationId,
    chunks: sent,
  });
}

function parseIncoming(url: URL, body: unknown): IncomingMessage | { error: string } {
  const record = asRecord(body);
  const integrationId = stringValue(
    url.searchParams.get("integration_id") ?? record.integration_id,
  );

  if (!integrationId || !UUID_PATTERN.test(integrationId)) {
    return { error: "Нужен integration_id." };
  }

  const green = asRecord(record.messageData);
  const greenText = asRecord(green.textMessageData);
  const sender = asRecord(record.senderData);
  const telegram = asRecord(record.message);
  const telegramChat = asRecord(telegram.chat);

  const text = firstString(record.text, record.message, greenText.textMessage, telegram.text);
  const externalChatId = firstString(
    record.external_chat_id,
    record.chat_id,
    sender.chatId,
    telegramChat.id,
  );
  const contactName = firstString(record.contact_name, sender.senderName, telegramChat.first_name);
  const externalMessageId = firstString(
    record.external_message_id,
    record.idMessage,
    telegram.message_id,
  );

  if (!text) {
    return { error: "Пустое сообщение." };
  }

  if (!externalChatId) {
    return { error: "Нужен external_chat_id." };
  }

  if (text.length > 8000 || externalChatId.length > 200) {
    return { error: "Сообщение слишком длинное." };
  }

  return {
    integrationId,
    externalChatId,
    text,
    contactName,
    externalMessageId,
  };
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

  if (lookupError) {
    throw new Error(lookupError.message);
  }

  const patch = {
    user_id: input.userId,
    agent_id: input.agentId,
    contact_name: input.contactName,
    last_message_preview: input.preview.slice(0, 140),
    last_message_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from("conversations").update(patch).eq("id", existing.id);
    if (error) {
      throw new Error(error.message);
    }
    const flags = await readBotFlags(supabase, [existing.id as string]);
    return { id: existing.id as string, botActive: flags.get(existing.id as string) ?? true };
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      ...patch,
      integration_id: input.integrationId,
      external_chat_id: input.externalChatId,
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Не удалось создать диалог.");
  }

  return { id: data.id as string, botActive: true };
}

async function loadWebhookAgent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  agentId: string,
) {
  const withSplit = await supabase
    .from("agents")
    .select("id, system_prompt, model, temperature, is_active, split_messages")
    .eq("id", agentId)
    .maybeSingle();

  if (!withSplit.error || !withSplit.error.message.includes("split_messages")) {
    return withSplit;
  }

  const fallback = await supabase
    .from("agents")
    .select("id, system_prompt, model, temperature, is_active")
    .eq("id", agentId)
    .maybeSingle();

  return {
    data: fallback.data ? { ...fallback.data, split_messages: null } : null,
    error: fallback.error,
  };
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

function firstString(...values: unknown[]) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return "";
}

function asCredentials(value: unknown) {
  const record = asRecord(value);
  const credentials: Record<string, string> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "string") credentials[key] = entry;
  }
  return credentials;
}
