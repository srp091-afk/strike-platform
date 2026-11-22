import { createHmac, timingSafeEqual } from "node:crypto";

import { after, connection, type NextRequest } from "next/server";

import { isBotPauseActive, normalizeAgentModel, readMessageLimit } from "@/lib/agent-models";
import { pauseIfDialogueOverLimit, readBotFlags } from "@/lib/bot-state";
import { markAgentReplied, markClientReplied } from "@/lib/followup";
import { withKnowledge } from "@/lib/knowledge";
import { completeWithNotifyManager } from "@/lib/notify-manager";
import { replyChunks, sleep, splitPauseMs, stripMarkdown, systemPromptWithSplit } from "@/lib/reply";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendTwilioSms } from "@/lib/twilio-sms";
import { interpolatePrompt } from "@/lib/utils/prompt-parser";

export const maxDuration = 300;

const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AGENT_COLUMNS =
  "id, user_id, system_prompt, model, temperature, is_active, split_messages, limit_agent_messages, limit_client_messages, limit_total_messages, twilio_sms_enabled, twilio_account_sid, twilio_auth_token, twilio_sms_number";

type SmsAgent = {
  id: string;
  user_id: string;
  system_prompt: string | null;
  model: string | null;
  temperature: number | null;
  is_active: boolean | null;
  split_messages: boolean | null;
  limit_agent_messages: number | null;
  limit_client_messages: number | null;
  limit_total_messages: number | null;
  twilio_sms_enabled: boolean | null;
  twilio_account_sid: string | null;
  twilio_auth_token: string | null;
  twilio_sms_number: string | null;
};

export async function POST(request: NextRequest, context: { params: Promise<{ agentId: string }> }) {
  await connection();
  try {
    const { agentId } = await context.params;
    if (!UUID_PATTERN.test(agentId)) return twiml();

    const form = await request.formData().catch(() => null);
    if (!form) return twiml();
    const params: Record<string, string> = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") params[key] = value;
    }

    const from = (params.From ?? "").trim();
    const body = (params.Body ?? "").trim().slice(0, 4000);
    const messageSid = (params.MessageSid ?? "").trim();
    if (!from || !body) return twiml();

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase.from("agents").select(AGENT_COLUMNS).eq("id", agentId).maybeSingle();
    if (error || !data) {
      if (error) console.error("[twilio sms]", error.message);
      return twiml();
    }
    const agent = data as SmsAgent;
    if (agent.twilio_sms_enabled !== true || !agent.user_id) return twiml();

    const accountSid = (agent.twilio_account_sid ?? "").trim();
    const authToken = (agent.twilio_auth_token ?? "").trim();
    const fromNumber = (agent.twilio_sms_number ?? "").trim();
    if (!accountSid || !authToken || !fromNumber) return twiml();

    const signature = request.headers.get("x-twilio-signature") ?? "";
    if (!signature || !validTwilioSignature(authToken, signature, signatureUrls(request), params)) {
      return new Response("Forbidden", { status: 403 });
    }

    const integrationId = await ensureSmsIntegration(supabase, { userId: agent.user_id, agentId: agent.id });
    const conversation = await upsertConversation(supabase, {
      userId: agent.user_id,
      agentId: agent.id,
      integrationId,
      externalChatId: from,
      preview: body,
    });

    if (messageSid) {
      const existing = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversation.id)
        .eq("external_message_id", messageSid)
        .limit(1)
        .maybeSingle();
      if (existing.data?.id) return twiml();
    }

    const { error: inboundError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: body,
      status: "sent",
      ...(messageSid ? { external_message_id: messageSid } : {}),
    });
    if (inboundError) {
      console.error("[twilio sms] inbound", inboundError.message);
      return twiml();
    }
    await markClientReplied(supabase, conversation.id);

    if (agent.is_active !== true) return twiml();
    if (!conversation.botActive) {
      const { data: pause } = await supabase.from("conversations").select("bot_paused_until").eq("id", conversation.id).maybeSingle();
      if (isBotPauseActive(pause?.bot_paused_until)) return twiml();
    }
    if (
      await pauseIfDialogueOverLimit(supabase, conversation.id, {
        agent: readMessageLimit(agent.limit_agent_messages),
        client: readMessageLimit(agent.limit_client_messages),
        total: readMessageLimit(agent.limit_total_messages),
      })
    ) {
      return twiml();
    }

    after(async () => {
      try {
        await replyBySms({ supabase, agent, conversationId: conversation.id, from, body, accountSid, authToken, fromNumber });
      } catch (failure) {
        console.error("[twilio sms] reply", failure instanceof Error ? failure.message : failure);
      }
    });
  } catch (failure) {
    console.error("[twilio sms]", failure instanceof Error ? failure.message : failure);
  }
  return twiml();
}

async function replyBySms(input: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  agent: SmsAgent;
  conversationId: string;
  from: string;
  body: string;
  accountSid: string;
  authToken: string;
  fromNumber: string;
}) {
  const { supabase, agent } = input;
  const { data: history, error: historyError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", input.conversationId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (historyError) throw new Error(historyError.message);

  const dialogue = (history ?? [])
    .reverse()
    .filter((item) => item.role === "user" || item.role === "assistant")
    .map((item) => ({ role: item.role as "user" | "assistant", content: String(item.content ?? "") }));

  const model = normalizeAgentModel(agent.model);
  const completion = await completeWithNotifyManager({
    model,
    temperature: model.includes("gpt-6") ? 1 : clampTemperature(agent.temperature),
    messages: [
      {
        role: "system",
        content: await withKnowledge(
          systemPromptWithSplit(
            interpolatePrompt((agent.system_prompt as string) || "You are a STRIKE agent.", {
              source: "sms",
              client_name: input.from,
              client_phone: input.from,
            }),
            agent.split_messages,
          ),
          String(agent.id),
          input.body,
        ),
      },
      ...dialogue,
    ],
    chat: {
      supabase,
      conversationId: input.conversationId,
      agentId: String(agent.id),
      channel: "sms",
      clientHandle: input.from,
      clientName: input.from,
    },
    delivery: {
      channel: "sms",
      chatId: input.from,
      client: { name: input.from, phone: input.from },
    },
  });

  const reply = stripMarkdown(completion.text).trim();
  if (!reply || completion.pausedByTool) return;

  const chunks = replyChunks(reply, agent.split_messages);
  let preview = chunks[0] ?? reply;
  let repliedOk = false;
  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) await sleep(splitPauseMs());
    const plain = stripMarkdown(chunk).trim();
    if (!plain) continue;
    const sent = await sendTwilioSms({
      accountSid: input.accountSid,
      authToken: input.authToken,
      from: input.fromNumber,
      to: input.from,
      body: plain,
    });
    const { error: storedError } = await supabase.from("messages").insert({
      conversation_id: input.conversationId,
      role: "assistant",
      content: plain,
      status: sent.ok ? "sent" : "failed",
      ...(sent.ok ? { external_message_id: sent.sid } : {}),
    });
    if (storedError) throw new Error(storedError.message);
    preview = plain;
    repliedOk = sent.ok;
    if (!sent.ok) {
      console.error("[twilio sms] send", sent.error);
      break;
    }
  }

  await supabase
    .from("conversations")
    .update({
      last_message_preview: preview.slice(0, 140),
      last_message_at: new Date().toISOString(),
      agent_id: agent.id,
    })
    .eq("id", input.conversationId);
  if (repliedOk) await markAgentReplied(supabase, input.conversationId);
}

function twiml() {
  return new Response(EMPTY_TWIML, {
    status: 200,
    headers: { "Content-Type": "text/xml", "Cache-Control": "no-store" },
  });
}

function clampTemperature(value: unknown) {
  const temperature = Number(value);
  if (!Number.isFinite(temperature)) return 0.7;
  return Math.min(2, Math.max(0, temperature));
}

function signatureUrls(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const urls = new Set<string>();
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) urls.add(`${forwardedProto}://${forwardedHost}${path}`);
  urls.add(request.url.split("?")[0] ?? request.url);
  for (const base of [process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL, "https://www.strikeplatform.io"]) {
    const origin = base?.trim().replace(/\/$/, "");
    if (origin) urls.add(`${origin}${path}`);
  }
  return [...urls];
}

function validTwilioSignature(token: string, signature: string, urls: string[], params: Record<string, string>) {
  const keys = Object.keys(params).sort();
  for (const url of urls) {
    const payload = keys.reduce((acc, key) => acc + key + params[key], url);
    const expected = createHmac("sha1", token).update(payload).digest("base64");
    const left = Buffer.from(expected);
    const right = Buffer.from(signature);
    if (left.length === right.length && timingSafeEqual(left, right)) return true;
  }
  return false;
}

async function ensureSmsIntegration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: { userId: string; agentId: string },
) {
  const externalId = `sms:${input.agentId}`;
  const { data: existing, error: lookupError } = await supabase
    .from("integrations")
    .select("id")
    .eq("provider", "sms")
    .eq("external_id", externalId)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing?.id) {
    await supabase
      .from("integrations")
      .update({ agent_id: input.agentId, user_id: input.userId, status: "connected" })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("integrations")
    .insert({
      user_id: input.userId,
      agent_id: input.agentId,
      provider: "sms",
      name: "SMS",
      status: "connected",
      external_id: externalId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось привязать SMS.");
  return data.id as string;
}

async function upsertConversation(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  input: {
    userId: string;
    agentId: string;
    integrationId: string;
    externalChatId: string;
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
    contact_name: input.externalChatId,
    contact_handle: input.externalChatId,
    last_message_preview: input.preview.slice(0, 140),
    last_message_at: new Date().toISOString(),
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
  if (error || !data) throw new Error(error?.message ?? "Не удалось создать SMS-диалог.");
  const flags = await readBotFlags(supabase, [data.id as string]);
  return { id: data.id as string, botActive: flags.get(data.id as string) ?? true };
}
