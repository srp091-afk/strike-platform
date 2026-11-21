import "server-only";

import { pauseBotForHandoff } from "@/lib/bot-state";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const TIMEOUT_MS = 5000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AmoStatus = { id: string; name: string };
export type AmoPipeline = { id: string; name: string; statuses: AmoStatus[] };

export type AmoAgent = {
  id: string;
  domain: string;
  token: string;
  pipelineId: string | null;
  handoffStatusId: string | null;
};

export type AmoLeadClient = {
  channel: string;
  chatId: string;
  clientName: string | null;
  clientPhone: string | null;
};

/** Пустая строка — поля нет. null — домен не из amoCRM/Kommo. */
export function readAmoDomain(value: string) {
  const host = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!host) return "";
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)) return null;
  if (!host.endsWith(".amocrm.ru") && !host.endsWith(".amocrm.com") && !host.endsWith(".kommo.com")) return null;
  return host;
}

export async function testAmoConnection(domain: string, token: string): Promise<
  { ok: true; accountName: string; pipelines: AmoPipeline[] } | { ok: false; error: string }
> {
  const host = readAmoDomain(domain);
  if (!host) return { ok: false, error: "Домен должен быть вида company.amocrm.ru или company.kommo.com." };
  if (!token.trim()) return { ok: false, error: "Укажите долгосрочный токен." };

  const account = await amoRequest(host, token, "/api/v4/account");
  if (!account.ok) return { ok: false, error: account.error };
  const pipelines = await amoRequest(host, token, "/api/v4/leads/pipelines");
  if (!pipelines.ok) return { ok: false, error: pipelines.error };

  const accountRecord = asRecord(account.data);
  const name = typeof accountRecord.name === "string" && accountRecord.name.trim() ? accountRecord.name.trim() : host;
  return { ok: true, accountName: name, pipelines: readPipelines(pipelines.data) };
}

/** Находит или создаёт сделку и запоминает связку. Ошибка CRM возвращает null и не бросается наружу. */
export async function findOrCreateAmoLead(agent: AmoAgent, client: AmoLeadClient): Promise<{ contactId: string; leadId: string } | null> {
  const channel = client.channel.trim().slice(0, 40) || "unknown";
  const chatId = client.chatId.trim().slice(0, 200);
  if (!chatId) return null;

  try {
    const existing = await readLink(agent.id, channel, chatId);
    if (existing) return existing;

    const query = (client.clientPhone || chatId).replace(/[^\dA-Za-z@._+-]/g, "").slice(0, 80);
    const found = query ? await findContact(agent, query) : null;
    const created = found
      ? await createLeadForContact(agent, client, found)
      : await createLeadWithContact(agent, client);
    if (!created) return null;

    const saved = await saveLink(agent.id, channel, chatId, created);
    return saved ?? created;
  } catch (error) {
    console.error("[amocrm] lead", agent.id, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function syncMessageToAmo(agent: AmoAgent, leadId: string, role: "user" | "assistant", text: string, channel: string) {
  const body = text.trim();
  if (!body || !/^\d+$/.test(leadId)) return;
  const note = role === "user"
    ? `👤 Клиент (${channel}):\n${body.slice(0, 8000)}`
    : `🤖 ИИ-агент:\n${body.slice(0, 8000)}`;
  const result = await amoRequest(agent.domain, agent.token, `/api/v4/leads/${leadId}/notes`, {
    method: "POST",
    body: [{ note_type: "common", params: { text: note } }],
  });
  if (!result.ok) console.error("[amocrm] note", agent.id, result.error);
}

export async function triggerAmoHandoff(agent: AmoAgent, leadId: string, reason: string) {
  if (!/^\d+$/.test(leadId)) return;
  const why = reason.trim() || "Запрос клиента";
  const lead = await amoRequest(agent.domain, agent.token, `/api/v4/leads/${leadId}`);
  const leadRecord = lead.ok ? asRecord(lead.data) : {};

  if (agent.handoffStatusId) {
    const pipelineId = agent.pipelineId || idString(leadRecord.pipeline_id);
    const moved = await amoRequest(agent.domain, agent.token, `/api/v4/leads/${leadId}`, {
      method: "PATCH",
      body: {
        status_id: Number(agent.handoffStatusId),
        ...(pipelineId ? { pipeline_id: Number(pipelineId) } : {}),
      },
    });
    if (!moved.ok) console.error("[amocrm] status", agent.id, moved.error);
  }

  const noted = await amoRequest(agent.domain, agent.token, `/api/v4/leads/${leadId}/notes`, {
    method: "POST",
    body: [{
      note_type: "common",
      params: { text: `⚠️ Вмешательство оператора: ИИ-агент остановлен. Причина: ${why.slice(0, 1000)}` },
    }],
  });
  if (!noted.ok) console.error("[amocrm] handoff note", agent.id, noted.error);

  const responsible = idString(leadRecord.responsible_user_id);
  if (!responsible) {
    console.error("[amocrm] task", agent.id, "нет ответственного у сделки");
    return;
  }
  const task = await amoRequest(agent.domain, agent.token, "/api/v4/tasks", {
    method: "POST",
    body: [{
      task_type_id: 1,
      text: "Перехватить диалог с клиентом",
      complete_till: Math.floor(Date.now() / 1000) + 15 * 60,
      entity_id: Number(leadId),
      entity_type: "leads",
      responsible_user_id: Number(responsible),
    }],
  });
  if (!task.ok) console.error("[amocrm] task", agent.id, task.error);
}

/** Один проход после ответа клиенту: сделка, обе реплики и перевод на оператора. */
export async function syncAgentTurnToAmo(
  agentId: string,
  input: AmoLeadClient & { inbound: string; reply: string; handoffReason: string | null },
) {
  try {
    const agent = await loadAmoAgent(agentId);
    if (!agent) return;
    const link = await findOrCreateAmoLead(agent, input);
    if (!link) return;
    if (input.inbound.trim()) await syncMessageToAmo(agent, link.leadId, "user", input.inbound, input.channel);
    if (input.reply.trim()) await syncMessageToAmo(agent, link.leadId, "assistant", input.reply, input.channel);
    if (input.handoffReason !== null) await triggerAmoHandoff(agent, link.leadId, input.handoffReason);
  } catch (error) {
    console.error("[amocrm] sync", agentId, error instanceof Error ? error.message : error);
  }
}

export async function pauseChatsForAmoLead(agentId: string, leadId: string) {
  if (!UUID_PATTERN.test(agentId) || !/^\d+$/.test(leadId)) return;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_chat_links")
    .select("chat_id")
    .eq("agent_id", agentId)
    .eq("amo_lead_id", Number(leadId));
  if (error) {
    console.error("[amocrm] pause lookup", error.message);
    return;
  }
  for (const row of data ?? []) {
    const chatId = typeof row.chat_id === "string" ? row.chat_id : "";
    if (!UUID_PATTERN.test(chatId)) continue;
    try {
      await pauseBotForHandoff(supabase, chatId, "forever");
    } catch (failure) {
      console.error("[amocrm] pause", failure instanceof Error ? failure.message : failure);
    }
  }
}

export async function loadAmoAgent(agentId: string): Promise<AmoAgent | null> {
  if (!UUID_PATTERN.test(agentId)) return null;
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("agents")
      .select("id, amo_domain, amo_access_token, amo_pipeline_id, amo_handoff_status_id")
      .eq("id", agentId)
      .maybeSingle();
    if (error || !data) return null;
    const domain = typeof data.amo_domain === "string" ? readAmoDomain(data.amo_domain) : "";
    const token = typeof data.amo_access_token === "string" ? data.amo_access_token.trim() : "";
    if (!domain || !token) return null;
    return {
      id: String(data.id),
      domain,
      token,
      pipelineId: idString(data.amo_pipeline_id),
      handoffStatusId: idString(data.amo_handoff_status_id),
    };
  } catch (error) {
    console.error("[amocrm] load", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Заметка в сделку, уже связанную с этим диалогом. Ошибка CRM не пробрасывается. */
export async function noteAmoPayment(agentId: string, chatId: string, text: string) {
  try {
    const agent = await loadAmoAgent(agentId);
    const note = text.trim();
    if (!agent || !note || !chatId.trim()) return;
    const supabase = createSupabaseAdminClient();
    const { data } = await supabase
      .from("crm_chat_links")
      .select("amo_lead_id")
      .eq("agent_id", agentId)
      .eq("chat_id", chatId)
      .not("amo_lead_id", "is", null)
      .limit(1);
    const leadId = data?.[0]?.amo_lead_id ? String(data[0].amo_lead_id) : "";
    if (!/^\d+$/.test(leadId)) return;
    const noted = await amoRequest(agent.domain, agent.token, `/api/v4/leads/${leadId}/notes`, {
      method: "POST",
      body: [{ note_type: "common", params: { text: note.slice(0, 4000) } }],
    });
    if (!noted.ok) console.error("[amocrm] payment note", agentId, noted.error);
  } catch (error) {
    console.error("[amocrm] payment note", agentId, error instanceof Error ? error.message : error);
  }
}

async function findContact(agent: AmoAgent, query: string) {
  const result = await amoRequest(agent.domain, agent.token, `/api/v4/contacts?query=${encodeURIComponent(query)}`);
  if (!result.ok) return null;
  const contacts = embeddedList(result.data, "contacts");
  const id = idString(asRecord(contacts[0]).id);
  return id || null;
}

async function createLeadWithContact(agent: AmoAgent, client: AmoLeadClient) {
  const contact: Record<string, unknown> = { first_name: (client.clientName || client.clientPhone || "Клиент").slice(0, 100) };
  if (client.clientPhone) {
    contact.custom_fields_values = [{
      field_code: "PHONE",
      values: [{ value: client.clientPhone, enum_code: "WORK" }],
    }];
  }
  const lead: Record<string, unknown> = {
    name: leadName(client),
    _embedded: { contacts: [contact] },
  };
  if (agent.pipelineId) lead.pipeline_id = Number(agent.pipelineId);
  const result = await amoRequest(agent.domain, agent.token, "/api/v4/leads/complex", { method: "POST", body: [lead] });
  if (!result.ok) {
    console.error("[amocrm] complex", agent.id, result.error);
    return null;
  }
  const row = Array.isArray(result.data) ? asRecord(result.data[0]) : asRecord(embeddedList(result.data, "leads")[0]);
  const leadId = idString(row.id);
  const contactId = idString(row.contact_id) || idString(asRecord(embeddedList(row, "contacts")[0]).id);
  if (!leadId || !contactId) return null;
  return { leadId, contactId };
}

async function createLeadForContact(agent: AmoAgent, client: AmoLeadClient, contactId: string) {
  const lead: Record<string, unknown> = {
    name: leadName(client),
    _embedded: { contacts: [{ id: Number(contactId) }] },
  };
  if (agent.pipelineId) lead.pipeline_id = Number(agent.pipelineId);
  const result = await amoRequest(agent.domain, agent.token, "/api/v4/leads", { method: "POST", body: [lead] });
  if (!result.ok) {
    console.error("[amocrm] lead create", agent.id, result.error);
    return null;
  }
  const row = asRecord(embeddedList(result.data, "leads")[0]);
  const leadId = idString(row.id);
  if (!leadId) return null;
  return { leadId, contactId };
}

function leadName(client: AmoLeadClient) {
  const who = client.clientName || client.clientPhone || client.chatId;
  return `Заявка из ${client.channel}: ${who}`.slice(0, 200);
}

async function readLink(agentId: string, channel: string, chatId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_chat_links")
    .select("amo_contact_id, amo_lead_id")
    .eq("agent_id", agentId)
    .eq("channel", channel)
    .eq("chat_id", chatId)
    .maybeSingle();
  if (error || !data) return null;
  const leadId = idString(data.amo_lead_id);
  const contactId = idString(data.amo_contact_id);
  if (!leadId || !contactId) return null;
  return { leadId, contactId };
}

async function saveLink(agentId: string, channel: string, chatId: string, ids: { contactId: string; leadId: string }) {
  const supabase = createSupabaseAdminClient();
  const row = {
    amo_contact_id: Number(ids.contactId),
    amo_lead_id: Number(ids.leadId),
  };
  const { data: existing, error: readError } = await supabase
    .from("crm_chat_links")
    .select("id")
    .eq("agent_id", agentId)
    .eq("channel", channel)
    .eq("chat_id", chatId)
    .maybeSingle();
  if (readError) {
    console.error("[amocrm] link", readError.message);
    return ids;
  }
  if (existing?.id) {
    const { error } = await supabase.from("crm_chat_links").update(row).eq("id", existing.id);
    if (error) console.error("[amocrm] link", error.message);
    return ids;
  }
  const { error } = await supabase.from("crm_chat_links").insert({
    agent_id: agentId,
    channel,
    chat_id: chatId,
    ...row,
  });
  if (!error) return ids;
  if (!/duplicate|unique/i.test(error.message)) {
    console.error("[amocrm] link", error.message);
    return ids;
  }
  const { error: updateError } = await supabase
    .from("crm_chat_links")
    .update(row)
    .eq("agent_id", agentId)
    .eq("channel", channel)
    .eq("chat_id", chatId);
  if (updateError) console.error("[amocrm] link", updateError.message);
  return ids;
}

async function amoRequest(
  domain: string,
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number; error: string }> {
  const host = readAmoDomain(domain);
  if (!host || !token.trim()) return { ok: false, status: 0, error: "amoCRM не настроен." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://${host}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: "application/json",
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    if (response.status === 204) return { ok: true, status: 204, data: null };
    const data = await response.json().catch(() => null);
    if (!response.ok) return { ok: false, status: response.status, error: amoError(data, response.status) };
    return { ok: true, status: response.status, data };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, status: 0, error: aborted ? "Таймаут 5 с" : "amoCRM недоступен." };
  } finally {
    clearTimeout(timer);
  }
}

function amoError(data: unknown, status: number) {
  if (status === 401 || status === 403) return "Токен отклонён. Проверьте долгосрочный токен amoCRM/Kommo.";
  const record = asRecord(data);
  if (typeof record.detail === "string" && record.detail.trim()) return record.detail.trim();
  if (typeof record.title === "string" && record.title.trim()) return record.title.trim();
  return `HTTP ${status}`;
}

function readPipelines(data: unknown): AmoPipeline[] {
  return embeddedList(data, "pipelines").map((item) => {
    const pipeline = asRecord(item);
    const id = idString(pipeline.id);
    if (!id) return null;
    const statuses = embeddedList(pipeline, "statuses").map((status) => {
      const row = asRecord(status);
      const statusId = idString(row.id);
      if (!statusId) return null;
      return { id: statusId, name: typeof row.name === "string" && row.name.trim() ? row.name.trim() : statusId };
    }).filter((status): status is AmoStatus => status !== null);
    return {
      id,
      name: typeof pipeline.name === "string" && pipeline.name.trim() ? pipeline.name.trim() : id,
      statuses,
    };
  }).filter((pipeline): pipeline is AmoPipeline => pipeline !== null);
}

function embeddedList(data: unknown, key: string) {
  const embedded = asRecord(asRecord(data)._embedded);
  const list = embedded[key];
  return Array.isArray(list) ? list : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function idString(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  return "";
}
