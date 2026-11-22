import { after, connection, type NextRequest } from "next/server";

import { isBotPauseActive, readMessageLimit } from "@/lib/agent-models";
import { pauseIfDialogueOverLimit } from "@/lib/bot-state";
import { openChannelConversation } from "@/lib/channel-inbox";
import { completeChannelReply } from "@/lib/channel-turn";
import { markAgentReplied, markClientReplied } from "@/lib/followup";
import { replyChunks, sleep, splitPauseMs, stripMarkdown } from "@/lib/reply";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendViberMessage, verifyViberSignature } from "@/lib/viber";

export const maxDuration = 300;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AGENT_COLUMNS =
  "id, user_id, name, system_prompt, model, temperature, is_active, split_messages, limit_agent_messages, limit_client_messages, limit_total_messages, viber_enabled, viber_auth_token, viber_bot_name";

type ViberAgent = {
  id: string;
  user_id: string;
  name: string | null;
  system_prompt: string | null;
  model: string | null;
  temperature: number | null;
  is_active: boolean | null;
  split_messages: boolean | null;
  limit_agent_messages: number | null;
  limit_client_messages: number | null;
  limit_total_messages: number | null;
  viber_enabled: boolean | null;
  viber_auth_token: string | null;
  viber_bot_name: string | null;
};

export async function POST(request: NextRequest, context: { params: Promise<{ agentId: string }> }) {
  await connection();
  const raw = await request.text();
  const payload = parseJson(raw);
  if (payload.event === "webhook") return Response.json({ ok: true });

  try {
    const { agentId } = await context.params;
    if (!UUID_PATTERN.test(agentId)) return Response.json({ ok: true });
    const message = readTextMessage(payload);
    if (!message) return Response.json({ ok: true });

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("agents").select(AGENT_COLUMNS).eq("id", agentId).maybeSingle();
    if (error || !data) {
      if (error) console.error("[viber]", error.message);
      return Response.json({ ok: true });
    }
    const agent = data as ViberAgent;
    if (agent.viber_enabled !== true || !agent.user_id) return Response.json({ ok: true });
    const authToken = (agent.viber_auth_token ?? "").trim();
    if (!authToken) return Response.json({ ok: true });

    const signature = request.headers.get("x-viber-content-signature") ?? "";
    if (!verifyViberSignature(raw, signature, authToken)) return Response.json({ ok: false }, { status: 403 });

    const conversation = await openChannelConversation(supabase, {
      userId: agent.user_id,
      agentId: agent.id,
      provider: "viber",
      externalChatId: message.senderId,
      contactName: message.senderName,
      preview: message.text,
    });
    if (message.token) {
      const existing = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("external_message_id", message.token)
        .limit(1)
        .maybeSingle();
      if (existing.data?.id) return Response.json({ ok: true });
    }

    const { error: inboundError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: message.text,
      status: "sent",
      ...(message.token ? { external_message_id: message.token } : {}),
    });
    if (inboundError) {
      console.error("[viber] inbound", inboundError.message);
      return Response.json({ ok: false }, { status: 500 });
    }
    await markClientReplied(supabase, conversation.id);

    if (agent.is_active !== true || !conversation.botActive) return Response.json({ ok: true });
    const { data: pause } = await supabase.from("conversations").select("bot_paused_until").eq("id", conversation.id).maybeSingle();
    if (isBotPauseActive(pause?.bot_paused_until)) return Response.json({ ok: true });
    if (
      await pauseIfDialogueOverLimit(supabase, conversation.id, {
        agent: readMessageLimit(agent.limit_agent_messages),
        client: readMessageLimit(agent.limit_client_messages),
        total: readMessageLimit(agent.limit_total_messages),
      })
    ) {
      return Response.json({ ok: true });
    }

    const senderName = (agent.viber_bot_name ?? "").trim() || (agent.name ?? "").trim() || "Ассистент";
    after(async () => {
      try {
        const completion = await completeChannelReply({
          supabase,
          agent,
          conversationId: conversation.id,
          channel: "viber",
          chatId: message.senderId,
          clientName: message.senderName,
          question: message.text,
        });
        if (!completion.text || completion.paused) return;
        const chunks = replyChunks(completion.text, agent.split_messages);
        let preview = chunks[0] ?? completion.text;
        let replied = false;
        for (const [index, chunk] of chunks.entries()) {
          if (index > 0) await sleep(splitPauseMs());
          const plain = stripMarkdown(chunk).trim();
          if (!plain) continue;
          const sent = await sendViberMessage({ authToken, receiver: message.senderId, text: plain, senderName });
          const { error: storedError } = await supabase.from("messages").insert({
            conversation_id: conversation.id,
            role: "assistant",
            content: plain,
            status: sent.ok ? "sent" : "failed",
          });
          if (storedError) throw new Error(storedError.message);
          preview = plain;
          replied = sent.ok;
          if (!sent.ok) {
            console.error("[viber] send", sent.error);
            break;
          }
        }
        await supabase
          .from("conversations")
          .update({ last_message_preview: preview.slice(0, 140), last_message_at: new Date().toISOString(), agent_id: agent.id })
          .eq("id", conversation.id);
        if (replied) await markAgentReplied(supabase, conversation.id);
      } catch (failure) {
        console.error("[viber] reply", failure instanceof Error ? failure.message : failure);
      }
    });
  } catch (failure) {
    console.error("[viber]", failure instanceof Error ? failure.message : failure);
  }
  return Response.json({ ok: true });
}

function parseJson(raw: string) {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function readTextMessage(payload: Record<string, unknown>) {
  if (payload.event !== "message") return null;
  const message = asRecord(payload.message);
  if (message.type !== "text") return null;
  const text = typeof message.text === "string" ? message.text.trim().slice(0, 7000) : "";
  const sender = asRecord(payload.sender);
  const senderId = typeof sender.id === "string" ? sender.id.trim() : "";
  const senderName = typeof sender.name === "string" ? sender.name.trim().slice(0, 120) : "";
  const token = payload.message_token == null ? "" : String(payload.message_token).slice(0, 80);
  if (!text || !senderId) return null;
  return { text, senderId, senderName: senderName || null, token };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
