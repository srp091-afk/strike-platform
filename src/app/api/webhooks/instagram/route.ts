import { after, type NextRequest } from "next/server";

import { normalizeAgentModel, readActiveChannels, readChannelDelays, readMessageLimit } from "@/lib/agent-models";
import { pauseIfDialogueOverLimit, readBotFlags } from "@/lib/bot-state";
import { deliverChunk } from "@/lib/deliver";
import { GRAPH, graphJson, verifySignature } from "@/lib/instagram";
import { completeWithNotifyManager } from "@/lib/notify-manager";
import { replyChunks, sleep, splitPauseMs, systemPromptWithSplit } from "@/lib/reply";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 300;

/** Лимит Instagram — 1000 байт на сообщение; режем с запасом по символам. */
const MAX_IG_CHARS = 900;

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/** Верификация подписки вебхука Meta: GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=... */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const expected = process.env.INSTAGRAM_VERIFY_TOKEN?.trim();
  if (!expected) return new Response("INSTAGRAM_VERIFY_TOKEN is not set", { status: 503 });
  if (params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Входящие события Instagram: подпись проверяется, ответ 200 уходит сразу, обработка — после ответа. */
export async function POST(request: NextRequest) {
  const secret = process.env.META_APP_SECRET?.trim();
  if (!secret) return Response.json({ error: "META_APP_SECRET is not set" }, { status: 503 });

  const raw = await request.text();
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Bad JSON" }, { status: 400 });
  }

  const events = readEvents(body);
  console.log("[instagram webhook] received", JSON.stringify({ object: asRecord(body).object, events: events.length }));
  if (events.length > 0) {
    after(async () => {
      for (const event of events) {
        try {
          await handleMessage(event);
        } catch (error) {
          console.error("[instagram webhook]", error instanceof Error ? error.message : error);
        }
      }
    });
  }
  return Response.json({ ok: true });
}

type IncomingEvent = { accountId: string; senderId: string; messageId: string; text: string };

function readEvents(body: unknown): IncomingEvent[] {
  const root = asRecord(body);
  if (root.object !== "instagram" && root.object !== "page") return [];
  const events: IncomingEvent[] = [];
  for (const entryValue of Array.isArray(root.entry) ? root.entry : []) {
    const entry = asRecord(entryValue);
    const entryId = stringValue(entry.id);
    for (const itemValue of Array.isArray(entry.messaging) ? entry.messaging : []) {
      const item = asRecord(itemValue);
      const message = asRecord(item.message);
      const text = stringValue(message.text).slice(0, 8000);
      const senderId = stringValue(asRecord(item.sender).id);
      const recipientId = stringValue(asRecord(item.recipient).id);
      const messageId = stringValue(message.mid);
      // Эхо собственных сообщений и вложения без текста пропускаем.
      if (message.is_echo === true || !text || !senderId || !messageId) continue;
      const accountId = recipientId || entryId;
      if (!accountId || senderId === accountId) continue;
      events.push({ accountId, senderId, messageId, text });
    }
  }
  return events;
}

async function handleMessage(message: IncomingEvent) {
  const supabase = createSupabaseAdminClient();
  const columns =
    "id, user_id, system_prompt, model, temperature, is_active, active_channels, split_messages, limit_agent_messages, limit_client_messages, limit_total_messages, instagram_account_id, instagram_access_token, instagram_page_id";
  const withDelays = await supabase
    .from("agents")
    .select(`${columns}, channel_delays`)
    .eq("instagram_account_id", message.accountId)
    .maybeSingle();
  const loaded = withDelays.error?.message.includes("channel_delays")
    ? await supabase.from("agents").select(columns).eq("instagram_account_id", message.accountId).maybeSingle()
    : withDelays;
  const agent = loaded.data as ((typeof withDelays)["data"] & { channel_delays?: unknown }) | null;
  if (loaded.error) throw new Error(loaded.error.message);
  if (!agent?.user_id || !agent.instagram_access_token || !agent.instagram_page_id) {
    console.log("[instagram webhook] agent not found for account", message.accountId);
    return;
  }

  const externalId = `ig:${message.messageId}`;
  const { data: duplicate, error: duplicateError } = await supabase
    .from("messages")
    .select("id")
    .eq("external_message_id", externalId)
    .limit(1);
  if (duplicateError) throw new Error(duplicateError.message);
  if (duplicate && duplicate.length > 0) return;

  const accessToken = String(agent.instagram_access_token);
  const integrationId = await ensureInstagramIntegration(supabase, { userId: String(agent.user_id), agentId: String(agent.id) });
  const conversation = await upsertConversation(supabase, {
    userId: String(agent.user_id),
    agentId: String(agent.id),
    integrationId,
    externalChatId: message.senderId,
    preview: message.text,
    lookupName: () => lookupContact(message.senderId, accessToken),
  });

  const { error: inboundError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: message.text,
    status: "sent",
    external_message_id: externalId,
  });
  if (inboundError) throw new Error(inboundError.message);

  if (agent.is_active !== true || !readActiveChannels(agent.active_channels).instagram) return;
  if (!conversation.botActive) return;
  if (
    await pauseIfDialogueOverLimit(supabase, conversation.id, {
      agent: readMessageLimit(agent.limit_agent_messages),
      client: readMessageLimit(agent.limit_client_messages),
      total: readMessageLimit(agent.limit_total_messages),
    })
  ) {
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
    .map((item) => ({ role: item.role as "user" | "assistant", content: item.content as string }));

  const model = normalizeAgentModel(agent.model);
  const completion = await completeWithNotifyManager({
    model,
    temperature: model.includes("gpt-6") ? 1 : clampTemperature(agent.temperature),
    messages: [
      { role: "system", content: systemPromptWithSplit((agent.system_prompt as string) || "You are a STRIKE agent.", agent.split_messages) },
      ...dialogue,
    ],
    chat: {
      supabase,
      conversationId: conversation.id,
      agentId: String(agent.id),
      channel: "instagram",
      clientHandle: conversation.contactName ?? message.senderId,
      clientName: conversation.contactName,
    },
  });

  const reply = completion.text;
  if (!reply) return;

  const responseDelay = readChannelDelays(agent.channel_delays).instagram;
  const chunks = replyChunks(reply, agent.split_messages).flatMap(splitLong);
  let preview = chunks[0] ?? reply;

  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) await sleep(splitPauseMs());
    else if (responseDelay > 0) await sleep(responseDelay * 1000);

    let delivered = false;
    try {
      const result = await deliverChunk({
        provider: "instagram",
        externalChatId: message.senderId,
        text: chunk,
        credentials: { pageId: String(agent.instagram_page_id), accessToken },
      });
      delivered = result.delivered;
      if (!delivered) console.error("[instagram webhook] delivery", result.detail);
    } catch (sendError) {
      console.error("[instagram webhook] send", sendError instanceof Error ? sendError.message : sendError);
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
    .update({ last_message_preview: preview.slice(0, 140), last_message_at: new Date().toISOString(), agent_id: agent.id })
    .eq("id", conversation.id);
}

function splitLong(text: string): string[] {
  if (text.length <= MAX_IG_CHARS) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > MAX_IG_CHARS) {
    const cut = Math.max(rest.lastIndexOf("\n", MAX_IG_CHARS), rest.lastIndexOf(" ", MAX_IG_CHARS));
    const at = cut > MAX_IG_CHARS / 2 ? cut : MAX_IG_CHARS;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts.filter(Boolean);
}

/** Имя собеседника по IGSID (best effort: без прав или при ошибке диалог остаётся без имени). */
async function lookupContact(senderId: string, accessToken: string): Promise<string | null> {
  try {
    const profile = await graphJson<{ name?: string; username?: string }>(
      `${GRAPH}/${encodeURIComponent(senderId)}?${new URLSearchParams({ fields: "name,username", access_token: accessToken })}`,
    );
    return profile.name || (profile.username ? `@${profile.username}` : null);
  } catch {
    return null;
  }
}

async function ensureInstagramIntegration(supabase: Admin, input: { userId: string; agentId: string }) {
  const externalId = `ig:${input.agentId}`;
  const { data: existing, error: lookupError } = await supabase
    .from("integrations")
    .select("id")
    .eq("provider", "instagram")
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
      provider: "instagram",
      name: "Instagram",
      status: "connected",
      external_id: externalId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось привязать Instagram.");
  return data.id as string;
}

async function upsertConversation(
  supabase: Admin,
  input: {
    userId: string;
    agentId: string;
    integrationId: string;
    externalChatId: string;
    preview: string;
    lookupName: () => Promise<string | null>;
  },
) {
  const { data: existing, error: lookupError } = await supabase
    .from("conversations")
    .select("id, contact_name")
    .eq("integration_id", input.integrationId)
    .eq("external_chat_id", input.externalChatId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const base = {
    user_id: input.userId,
    agent_id: input.agentId,
    last_message_preview: input.preview.slice(0, 140),
    last_message_at: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase.from("conversations").update(base).eq("id", existing.id);
    if (error) throw new Error(error.message);
    const flags = await readBotFlags(supabase, [existing.id as string]);
    return {
      id: existing.id as string,
      botActive: flags.get(existing.id as string) ?? true,
      contactName: existing.contact_name ? String(existing.contact_name) : null,
    };
  }

  const contactName = await input.lookupName();
  const { data, error } = await supabase
    .from("conversations")
    .insert({
      ...base,
      ...(contactName ? { contact_name: contactName } : {}),
      integration_id: input.integrationId,
      external_chat_id: input.externalChatId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось создать диалог.");
  return { id: data.id as string, botActive: true, contactName };
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