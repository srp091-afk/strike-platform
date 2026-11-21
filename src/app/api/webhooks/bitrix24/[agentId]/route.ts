import { connection } from "next/server";

import {
  loadBitrixAgent,
  pauseChatsForBitrixChat,
  pauseChatsForBitrixLead,
  pauseChatsForBitrixSession,
  readBitrixLeadStatus,
} from "@/lib/bitrix24";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWN_NOTE = /^(?:👤|🤖|⚠️)/u;

/** Битрикс24 отключает исходящий вебхук, если ответ не 200. Ошибки только в лог. */
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  await connection();
  try {
    const { agentId } = await params;
    if (UUID_PATTERN.test(agentId)) await applyBitrixWebhook(agentId, await request.text());
  } catch (error) {
    console.error("[bitrix24 webhook]", error instanceof Error ? error.message : error);
  }
  return new Response("OK", { status: 200 });
}

async function applyBitrixWebhook(agentId: string, raw: string) {
  const event = parseBitrixEvent(raw);
  if (!event) return;

  if (event.name === "ONIMCONNECTORMESSAGEADD") {
    const foreign = event.messages.filter((message) => !OWN_NOTE.test(message.text.trim()));
    if (event.messages.length > 0 && foreign.length === 0) return;
    for (const message of foreign) {
      if (message.chatId) await pauseChatsForBitrixChat(agentId, message.chatId);
      if (message.sessionId) await pauseChatsForBitrixSession(agentId, message.sessionId);
    }
    return;
  }

  if (event.name === "ONCRMLEADUPDATE" && event.leadId) {
    const agent = await loadBitrixAgent(agentId);
    if (!agent?.handoffStatusId) return;
    const status = event.statusId || (await readBitrixLeadStatus(agent, event.leadId));
    if (status === agent.handoffStatusId) await pauseChatsForBitrixLead(agentId, event.leadId);
  }
}

function parseBitrixEvent(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{")) {
    try {
      return readJsonEvent(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  return readFormEvent(new URLSearchParams(trimmed));
}

function readJsonEvent(payload: unknown) {
  const body = asRecord(payload);
  const name = text(body.event).toUpperCase();
  const data = asRecord(body.data);
  const fields = asRecord(data.FIELDS);
  const messages = (Array.isArray(data.MESSAGES) ? data.MESSAGES : []).map((item) => {
    const row = asRecord(item);
    return {
      chatId: text(asRecord(row.chat).id),
      sessionId: text(asRecord(row.im).chat_id),
      text: text(asRecord(row.message).text),
    };
  });
  return {
    name,
    leadId: text(fields.ID),
    statusId: text(fields.STATUS_ID),
    messages,
  };
}

function readFormEvent(params: URLSearchParams) {
  const messages = new Map<string, { chatId: string; sessionId: string; text: string }>();
  for (const [key, value] of params.entries()) {
    const chat = key.match(/^data\[MESSAGES\]\[(\d+)\]\[chat\]\[id\]$/i);
    if (chat?.[1]) ensureMessage(messages, chat[1]).chatId = value.trim();
    const session = key.match(/^data\[MESSAGES\]\[(\d+)\]\[im\]\[chat_id\]$/i);
    if (session?.[1]) ensureMessage(messages, session[1]).sessionId = value.trim();
    const note = key.match(/^data\[MESSAGES\]\[(\d+)\]\[message\]\[text\]$/i);
    if (note?.[1]) ensureMessage(messages, note[1]).text = value;
  }
  return {
    name: (params.get("event") ?? "").trim().toUpperCase(),
    leadId: (params.get("data[FIELDS][ID]") ?? "").trim(),
    statusId: (params.get("data[FIELDS][STATUS_ID]") ?? "").trim(),
    messages: [...messages.values()],
  };
}

function ensureMessage(messages: Map<string, { chatId: string; sessionId: string; text: string }>, index: string) {
  const current = messages.get(index) ?? { chatId: "", sessionId: "", text: "" };
  messages.set(index, current);
  return current;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}
