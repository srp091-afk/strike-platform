import "server-only";

import { pauseBotForHandoff } from "@/lib/bot-state";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const TIMEOUT_MS = 5000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BITRIX_ZONES = new Set([
  "ru", "com", "de", "eu", "ua", "kz", "by", "fr", "es", "pl", "it", "in", "jp", "uk",
  "com.br", "com.tr", "co.uk", "com.ua",
]);
const CONNECTOR_ICON = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="12" fill="#cf0234"/></svg>',
).toString("base64");
const registeredConnectors = new Set<string>();

export type BitrixOption = { id: string; name: string };

export type BitrixAgent = {
  id: string;
  webhookUrl: string;
  openLineId: string | null;
  responsibleId: string | null;
  handoffStatusId: string | null;
};

export type BitrixLeadClient = {
  channel: string;
  chatId: string;
  clientName: string | null;
  clientPhone: string | null;
};

/** Пустая строка — поля нет. null — URL не является входящим вебхуком облачного Битрикс24. */
export function readBitrixWebhook(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
  const host = url.hostname.toLowerCase();
  if (!isBitrixHost(host)) return null;
  const match = url.pathname.match(/^\/rest\/(\d{1,12})\/([A-Za-z0-9]{8,128})\/?$/);
  if (!match) return null;
  return `https://${host}/rest/${match[1]}/${match[2]}/`;
}

export async function testBitrixConnection(webhookUrl: string): Promise<
  { ok: true; portalName: string; openLines: BitrixOption[]; users: BitrixOption[]; statuses: BitrixOption[] }
  | { ok: false; error: string }
> {
  const webhook = readBitrixWebhook(webhookUrl);
  if (webhook === null) return { ok: false, error: "Вебхук должен быть вида https://company.bitrix24.ru/rest/1/код/." };
  if (!webhook) return { ok: false, error: "Укажите URL входящего вебхука Битрикс24." };

  const me = await bitrixRequest(webhook, "user.current");
  if (!me.ok) return { ok: false, error: me.error };
  const lines = await bitrixRequest(webhook, "imopenlines.config.list.get");
  if (!lines.ok) return { ok: false, error: lines.error };
  const users = await bitrixRequest(webhook, "user.get", { body: { filter: { ACTIVE: true } } });
  if (!users.ok) return { ok: false, error: users.error };
  const statuses = await bitrixRequest(webhook, "crm.status.list", { body: { filter: { ENTITY_ID: "STATUS" } } });
  if (!statuses.ok) return { ok: false, error: statuses.error };

  return {
    ok: true,
    portalName: new URL(webhook).hostname,
    openLines: readOpenLines(lines.data),
    users: readUsers(users.data),
    statuses: readStatuses(statuses.data),
  };
}

/** Находит или создаёт лид и запоминает связку. Ошибка CRM возвращает null и не бросается наружу. */
export async function findOrCreateBitrixLead(
  agent: BitrixAgent,
  client: BitrixLeadClient,
): Promise<{ leadId: string; sessionId: string } | null> {
  const channel = client.channel.trim().slice(0, 40) || "unknown";
  const chatId = client.chatId.trim().slice(0, 200);
  if (!chatId) return null;

  try {
    const existing = await readLink(agent.id, channel, chatId);
    if (existing?.leadId) return existing;

    const phone = client.clientPhone?.trim() || "";
    const duplicate = phone ? await findLeadByPhone(agent, phone) : null;
    const leadId = duplicate || (await createLead(agent, client));
    if (!leadId) return null;
    await saveLink(agent.id, channel, chatId, leadId);
    return { leadId, sessionId: existing?.sessionId || "" };
  } catch (error) {
    console.error("[bitrix24] lead", agent.id, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function syncMessageToBitrix(
  agent: BitrixAgent,
  leadId: string,
  role: "user" | "assistant",
  text: string,
  channel: string,
  chatId: string,
) {
  const body = text.trim();
  if (!body || !/^\d+$/.test(leadId)) return "";
  const note = role === "user"
    ? `👤 Клиент (${channel}):\n${body.slice(0, 8000)}`
    : `🤖 ИИ-агент:\n${body.slice(0, 8000)}`;
  const comment = await bitrixRequest(agent.webhookUrl, "crm.timeline.comment.add", {
    body: { fields: { ENTITY_ID: Number(leadId), ENTITY_TYPE: "lead", COMMENT: note } },
  });
  if (!comment.ok) console.error("[bitrix24] comment", agent.id, comment.error);

  if (!agent.openLineId) return "";
  await ensureConnector(agent);
  const sent = await bitrixRequest(agent.webhookUrl, "imconnector.send.messages", {
    body: {
      CONNECTOR: "strike_ai",
      LINE: /^\d+$/.test(agent.openLineId) ? Number(agent.openLineId) : agent.openLineId,
      MESSAGES: [{
        user: { id: chatId.slice(0, 200), name: role === "user" ? "Клиент" : "ИИ-агент" },
        message: { id: `${Date.now()}-${role}`.slice(0, 64), date: Math.floor(Date.now() / 1000), text: note },
        chat: { id: chatId.slice(0, 200) },
      }],
    },
  });
  if (!sent.ok) {
    console.error("[bitrix24] openline", agent.id, sent.error);
    return "";
  }
  return readSessionId(sent.data);
}

export async function triggerBitrixHandoff(agent: BitrixAgent, leadId: string, sessionId: string, reason: string) {
  if (!/^\d+$/.test(leadId)) return;
  const why = (reason.trim() || "Клиент готов к общению").slice(0, 500);
  const fields: Record<string, unknown> = {};
  if (agent.responsibleId) fields.ASSIGNED_BY_ID = Number(agent.responsibleId);
  if (agent.handoffStatusId) fields.STATUS_ID = agent.handoffStatusId;
  if (Object.keys(fields).length > 0) {
    const updated = await bitrixRequest(agent.webhookUrl, "crm.lead.update", { body: { id: Number(leadId), fields } });
    if (!updated.ok) console.error("[bitrix24] update", agent.id, updated.error);
  }

  if (sessionId && agent.responsibleId) {
    const transfer = await bitrixRequest(agent.webhookUrl, "imopenlines.operator.transfer", {
      body: { SESSION_ID: sessionId, CHAT_ID: sessionId, USER_ID: Number(agent.responsibleId) },
    });
    if (!transfer.ok) {
      const fallback = await bitrixRequest(agent.webhookUrl, "imopenlines.bot.session.transfer", {
        body: { CHAT_ID: sessionId, USER_ID: Number(agent.responsibleId), LEAVE: "Y" },
      });
      if (!fallback.ok) console.error("[bitrix24] transfer", agent.id, transfer.error, fallback.error);
    }
  }

  if (agent.responsibleId) {
    const notice = await bitrixRequest(agent.webhookUrl, "im.notify.personal.add", {
      body: {
        USER_ID: Number(agent.responsibleId),
        MESSAGE: `🔥 Горячий лид от STRIKE! Требуется перехват диалога. Причина: ${why}. Лид #${leadId}`,
      },
    });
    if (!notice.ok) console.error("[bitrix24] notify", agent.id, notice.error);
  }

  const noted = await bitrixRequest(agent.webhookUrl, "crm.timeline.comment.add", {
    body: {
      fields: {
        ENTITY_ID: Number(leadId),
        ENTITY_TYPE: "lead",
        COMMENT: "⚠️ Вмешательство оператора: ИИ-агент остановлен и передал диалог ответственному.",
      },
    },
  });
  if (!noted.ok) console.error("[bitrix24] handoff note", agent.id, noted.error);
}

/** Один проход после ответа клиенту: лид, обе реплики и перевод на ответственного. */
export async function syncAgentTurnToBitrix(
  agentId: string,
  input: BitrixLeadClient & { inbound: string; reply: string; handoffReason: string | null },
) {
  try {
    const agent = await loadBitrixAgent(agentId);
    if (!agent) return;
    const link = await findOrCreateBitrixLead(agent, input);
    if (!link) return;
    let sessionId = link.sessionId;
    if (input.inbound.trim()) {
      const next = await syncMessageToBitrix(agent, link.leadId, "user", input.inbound, input.channel, input.chatId);
      if (next) sessionId = next;
    }
    if (input.reply.trim()) {
      const next = await syncMessageToBitrix(agent, link.leadId, "assistant", input.reply, input.channel, input.chatId);
      if (next) sessionId = next;
    }
    if (sessionId && sessionId !== link.sessionId) await rememberSession(agent.id, input.channel, input.chatId, sessionId);
    if (input.handoffReason !== null) await triggerBitrixHandoff(agent, link.leadId, sessionId, input.handoffReason);
  } catch (error) {
    console.error("[bitrix24] sync", agentId, error instanceof Error ? error.message : error);
  }
}

export async function pauseChatsForBitrixLead(agentId: string, leadId: string) {
  if (!UUID_PATTERN.test(agentId) || !/^\d+$/.test(leadId)) return;
  await pauseLinkedChats(agentId, (supabase) =>
    supabase.from("crm_chat_links").select("chat_id").eq("agent_id", agentId).eq("bitrix_lead_id", Number(leadId)),
  );
}

export async function pauseChatsForBitrixChat(agentId: string, chatId: string) {
  const id = chatId.trim().slice(0, 200);
  if (!UUID_PATTERN.test(agentId) || !id) return;
  await pauseLinkedChats(agentId, (supabase) =>
    supabase.from("crm_chat_links").select("chat_id").eq("agent_id", agentId).eq("chat_id", id),
  );
}

export async function pauseChatsForBitrixSession(agentId: string, sessionId: string) {
  const id = sessionId.trim().slice(0, 40);
  if (!UUID_PATTERN.test(agentId) || !/^\d+$/.test(id)) return;
  await pauseLinkedChats(agentId, (supabase) =>
    supabase.from("crm_chat_links").select("chat_id").eq("agent_id", agentId).eq("bitrix_session_id", id),
  );
}

export async function readBitrixLeadStatus(agent: BitrixAgent, leadId: string) {
  if (!/^\d+$/.test(leadId)) return "";
  const result = await bitrixRequest(agent.webhookUrl, "crm.lead.get", { body: { id: Number(leadId) } });
  if (!result.ok) return "";
  return codeString(asRecord(result.data).STATUS_ID);
}

export async function loadBitrixAgent(agentId: string): Promise<BitrixAgent | null> {
  if (!UUID_PATTERN.test(agentId)) return null;
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("agents")
      .select("id, bitrix_webhook_url, bitrix_openline_id, bitrix_responsible_id, bitrix_handoff_status_id")
      .eq("id", agentId)
      .maybeSingle();
    if (error || !data) return null;
    const webhookUrl = typeof data.bitrix_webhook_url === "string" ? readBitrixWebhook(data.bitrix_webhook_url) : "";
    if (!webhookUrl) return null;
    return {
      id: String(data.id),
      webhookUrl,
      openLineId: codeString(data.bitrix_openline_id) || null,
      responsibleId: idString(data.bitrix_responsible_id) || null,
      handoffStatusId: codeString(data.bitrix_handoff_status_id) || null,
    };
  } catch (error) {
    console.error("[bitrix24] load", error instanceof Error ? error.message : error);
    return null;
  }
}

async function findLeadByPhone(agent: BitrixAgent, phone: string) {
  const result = await bitrixRequest(agent.webhookUrl, "crm.duplicate.findbycomm", {
    body: { type: "PHONE", values: [phone.slice(0, 40)] },
  });
  if (!result.ok) return null;
  const leads = asRecord(result.data).LEAD;
  const id = idString(Array.isArray(leads) ? leads[0] : "");
  return id || null;
}

async function createLead(agent: BitrixAgent, client: BitrixLeadClient) {
  const who = client.clientName || client.clientPhone || client.chatId;
  const fields: Record<string, unknown> = {
    TITLE: `Заявка из ${client.channel}: ${who}`.slice(0, 200),
    NAME: (client.clientName || client.clientPhone || "Клиент").slice(0, 100),
    SOURCE_DESCRIPTION: `STRIKE AI (${client.channel})`.slice(0, 200),
  };
  if (client.clientPhone) fields.PHONE = [{ VALUE: client.clientPhone, VALUE_TYPE: "WORK" }];
  if (agent.responsibleId) fields.ASSIGNED_BY_ID = Number(agent.responsibleId);
  const result = await bitrixRequest(agent.webhookUrl, "crm.lead.add", { body: { fields } });
  if (!result.ok) {
    console.error("[bitrix24] lead create", agent.id, result.error);
    return null;
  }
  return idString(result.data) || null;
}

async function ensureConnector(agent: BitrixAgent) {
  if (registeredConnectors.has(agent.id)) return;
  const result = await bitrixRequest(agent.webhookUrl, "imconnector.register", {
    body: {
      ID: "strike_ai",
      NAME: "STRIKE",
      ICON: { DATA_IMAGE: CONNECTOR_ICON, COLOR: "#cf0234", SIZE: "100%", POSITION: "center" },
    },
  });
  if (result.ok || /exist|already|registered/i.test(result.error)) registeredConnectors.add(agent.id);
  else console.error("[bitrix24] connector", agent.id, result.error);
}

async function readLink(agentId: string, channel: string, chatId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_chat_links")
    .select("bitrix_lead_id, bitrix_session_id")
    .eq("agent_id", agentId)
    .eq("channel", channel)
    .eq("chat_id", chatId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    leadId: idString(data.bitrix_lead_id),
    sessionId: idString(data.bitrix_session_id),
  };
}

async function saveLink(agentId: string, channel: string, chatId: string, leadId: string) {
  const supabase = createSupabaseAdminClient();
  const row = { bitrix_lead_id: Number(leadId) };
  const { data: existing, error: readError } = await supabase
    .from("crm_chat_links")
    .select("id")
    .eq("agent_id", agentId)
    .eq("channel", channel)
    .eq("chat_id", chatId)
    .maybeSingle();
  if (readError) {
    console.error("[bitrix24] link", readError.message);
    return;
  }
  if (existing?.id) {
    const { error } = await supabase.from("crm_chat_links").update(row).eq("id", existing.id);
    if (error) console.error("[bitrix24] link", error.message);
    return;
  }
  const { error } = await supabase.from("crm_chat_links").insert({
    agent_id: agentId,
    channel,
    chat_id: chatId,
    ...row,
  });
  if (!error || /duplicate|unique/i.test(error.message)) {
    if (error) {
      const { error: updateError } = await supabase
        .from("crm_chat_links")
        .update(row)
        .eq("agent_id", agentId)
        .eq("channel", channel)
        .eq("chat_id", chatId);
      if (updateError) console.error("[bitrix24] link", updateError.message);
    }
    return;
  }
  console.error("[bitrix24] link", error.message);
}

async function rememberSession(agentId: string, channel: string, chatId: string, sessionId: string) {
  if (!/^\d+$/.test(sessionId)) return;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("crm_chat_links")
    .update({ bitrix_session_id: sessionId })
    .eq("agent_id", agentId)
    .eq("channel", channel.trim().slice(0, 40) || "unknown")
    .eq("chat_id", chatId.trim().slice(0, 200));
  if (error) console.error("[bitrix24] session", error.message);
}

async function pauseLinkedChats(
  agentId: string,
  query: (supabase: ReturnType<typeof createSupabaseAdminClient>) => PromiseLike<{ data: { chat_id: string | null }[] | null; error: { message: string } | null }>,
) {
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await query(supabase);
    if (error) {
      console.error("[bitrix24] pause lookup", error.message);
      return;
    }
    const seen = new Set<string>();
    for (const row of data ?? []) {
      const chatId = typeof row.chat_id === "string" ? row.chat_id : "";
      if (!UUID_PATTERN.test(chatId) || seen.has(chatId)) continue;
      seen.add(chatId);
      try {
        await pauseBotForHandoff(supabase, chatId, "forever");
      } catch (failure) {
        console.error("[bitrix24] pause", failure instanceof Error ? failure.message : failure);
      }
    }
  } catch (error) {
    console.error("[bitrix24] pause", agentId, error instanceof Error ? error.message : error);
  }
}

async function bitrixRequest(
  webhookUrl: string,
  method: string,
  init?: { body?: unknown },
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const webhook = readBitrixWebhook(webhookUrl);
  if (!webhook || !/^[a-z0-9.]+$/i.test(method)) return { ok: false, error: "Битрикс24 не настроен." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${webhook}${method}.json`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(init?.body ?? {}),
      redirect: "manual",
      signal: controller.signal,
    });
    if (response.status >= 300 && response.status < 400) return { ok: false, error: "Битрикс24 недоступен." };
    const payload = await response.json().catch(() => null);
    const record = asRecord(payload);
    if (!response.ok || typeof record.error === "string") {
      return { ok: false, error: bitrixError(record, response.status) };
    }
    return { ok: true, data: "result" in record ? record.result : payload };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, error: aborted ? "Таймаут 5 с" : "Битрикс24 недоступен." };
  } finally {
    clearTimeout(timer);
  }
}

function bitrixError(record: Record<string, unknown>, status: number) {
  if (status === 401 || status === 403 || record.error === "INVALID_CREDENTIALS" || record.error === "NO_AUTH_FOUND") {
    return "Вебхук отклонён. Проверьте URL и права crm, im, imopenlines, imconnector, user.";
  }
  if (typeof record.error_description === "string" && record.error_description.trim()) return record.error_description.trim();
  if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
  return status ? `HTTP ${status}` : "Битрикс24 недоступен.";
}

function readOpenLines(data: unknown): BitrixOption[] {
  const list = Array.isArray(data) ? data : Object.values(asRecord(data));
  return list.map((item) => {
    const row = asRecord(item);
    const id = codeString(row.ID) || codeString(row.id);
    if (!id) return null;
    return { id, name: text(row.LINE_NAME) || text(row.NAME) || `Линия ${id}` };
  }).filter((item): item is BitrixOption => item !== null);
}

function readUsers(data: unknown): BitrixOption[] {
  const list = Array.isArray(data) ? data : [];
  return list.map((item) => {
    const row = asRecord(item);
    const id = idString(row.ID);
    if (!id) return null;
    const name = [text(row.NAME), text(row.LAST_NAME)].filter(Boolean).join(" ") || `Сотрудник ${id}`;
    return { id, name };
  }).filter((item): item is BitrixOption => item !== null);
}

function readStatuses(data: unknown): BitrixOption[] {
  const list = Array.isArray(data) ? data : [];
  return list.map((item) => {
    const row = asRecord(item);
    const id = codeString(row.STATUS_ID);
    if (!id) return null;
    return { id, name: text(row.NAME) || id };
  }).filter((item): item is BitrixOption => item !== null);
}

function readSessionId(data: unknown) {
  const root = asRecord(data);
  const nested = asRecord(root.DATA);
  const result = nested.RESULT ?? root.RESULT;
  const first = Array.isArray(result) ? asRecord(result[0]) : asRecord(result);
  const session = asRecord(first.session ?? first.SESSION);
  return idString(session.CHAT_ID) || idString(session.ID) || idString(asRecord(first.im).chat_id);
}

function isBitrixHost(host: string) {
  const parts = host.split(".");
  const index = parts.indexOf("bitrix24");
  if (index <= 0) return false;
  const zone = parts.slice(index + 1).join(".");
  return BITRIX_ZONES.has(zone) && parts.slice(0, index).every((part) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function idString(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  return "";
}

function codeString(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value.trim())) return value.trim();
  return "";
}
