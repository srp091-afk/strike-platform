import "server-only";

import { pauseBotForHandoff } from "@/lib/bot-state";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const TIMEOUT_MS = 5000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const API = "https://api.pipedrive.com/v1";

export type PipedriveStage = { id: string; name: string };
export type PipedrivePipeline = { id: string; name: string; stages: PipedriveStage[] };

export type PipedriveAgent = {
  id: string;
  token: string;
  pipelineId: string | null;
  handoffStageId: string | null;
};

export type PipedriveDealClient = {
  channel: string;
  chatId: string;
  clientName: string | null;
  clientPhone: string | null;
};

export async function testPipedriveConnection(apiToken: string): Promise<
  { ok: true; accountName: string; pipelines: PipedrivePipeline[] } | { ok: false; error: string }
> {
  const token = apiToken.trim();
  if (!token) return { ok: false, error: "Укажите API-токен Pipedrive." };

  const me = await pipedriveRequest(token, "/users/me");
  if (!me.ok) return { ok: false, error: me.error };
  const pipelines = await pipedriveRequest(token, "/pipelines?limit=500");
  if (!pipelines.ok) return { ok: false, error: pipelines.error };
  const stages = await pipedriveRequest(token, "/stages?limit=500");
  if (!stages.ok) return { ok: false, error: stages.error };

  const account = asRecord(me.data);
  const name = text(account.name) || text(account.company_name) || "Pipedrive";
  return { ok: true, accountName: name, pipelines: readPipelines(pipelines.data, stages.data) };
}

/** Находит или создаёт сделку и запоминает связку. Ошибка CRM возвращает null и не бросается наружу. */
export async function findOrCreatePipedriveDeal(
  agent: PipedriveAgent,
  client: PipedriveDealClient,
): Promise<{ personId: string; dealId: string } | null> {
  const channel = client.channel.trim().slice(0, 40) || "unknown";
  const chatId = client.chatId.trim().slice(0, 200);
  if (!chatId) return null;

  try {
    const existing = await readLink(agent.id, channel, chatId);
    if (existing) return existing;

    const term = (client.clientPhone || chatId).trim().slice(0, 80);
    const personId = (term ? await findPerson(agent, term) : null) || (await createPerson(agent, client));
    if (!personId) return null;
    const dealId = await createDeal(agent, client, personId);
    if (!dealId) return null;

    const saved = await saveLink(agent.id, channel, chatId, { personId, dealId });
    return saved ?? { personId, dealId };
  } catch (error) {
    console.error("[pipedrive] deal", agent.id, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function syncMessageToPipedrive(
  agent: PipedriveAgent,
  dealId: string,
  personId: string,
  role: "user" | "assistant",
  text: string,
  channel: string,
) {
  const body = text.trim();
  if (!body || !/^\d+$/.test(dealId)) return;
  const safe = escapeHtml(body.slice(0, 8000));
  const content = role === "user"
    ? `<b>👤 Клиент (${escapeHtml(channel)}):</b><br>${safe}`
    : `<b>🤖 ИИ-агент:</b><br>${safe}`;
  const result = await pipedriveRequest(agent.token, "/notes", {
    method: "POST",
    body: {
      content,
      deal_id: Number(dealId),
      ...( /^\d+$/.test(personId) ? { person_id: Number(personId) } : {}),
    },
  });
  if (!result.ok) console.error("[pipedrive] note", agent.id, result.error);
}

export async function triggerPipedriveHandoff(agent: PipedriveAgent, dealId: string, personId: string, reason: string) {
  if (!/^\d+$/.test(dealId)) return;
  const why = escapeHtml((reason.trim() || "Запрос клиента").slice(0, 1000));

  if (agent.handoffStageId && /^\d+$/.test(agent.handoffStageId)) {
    const moved = await pipedriveRequest(agent.token, `/deals/${dealId}`, {
      method: "PUT",
      body: { stage_id: Number(agent.handoffStageId) },
    });
    if (!moved.ok) console.error("[pipedrive] stage", agent.id, moved.error);
  }

  const noted = await pipedriveRequest(agent.token, "/notes", {
    method: "POST",
    body: {
      content: `<b>⚠️ Вмешательство оператора:</b> ИИ-агент остановлен. Причина: ${why}`,
      deal_id: Number(dealId),
      ...( /^\d+$/.test(personId) ? { person_id: Number(personId) } : {}),
    },
  });
  if (!noted.ok) console.error("[pipedrive] handoff note", agent.id, noted.error);

  const today = new Date().toISOString().slice(0, 10);
  const activity = await pipedriveRequest(agent.token, "/activities", {
    method: "POST",
    body: {
      subject: "Перехватить диалог с клиентом",
      type: "call",
      due_date: today,
      deal_id: Number(dealId),
      ...( /^\d+$/.test(personId) ? { person_id: Number(personId) } : {}),
    },
  });
  if (!activity.ok) console.error("[pipedrive] activity", agent.id, activity.error);
}

/** Один проход после ответа клиенту: сделка, обе реплики и перевод на оператора. */
export async function syncAgentTurnToPipedrive(
  agentId: string,
  input: PipedriveDealClient & { inbound: string; reply: string; handoffReason: string | null },
) {
  try {
    const agent = await loadPipedriveAgent(agentId);
    if (!agent) return;
    const link = await findOrCreatePipedriveDeal(agent, input);
    if (!link) return;
    if (input.inbound.trim()) await syncMessageToPipedrive(agent, link.dealId, link.personId, "user", input.inbound, input.channel);
    if (input.reply.trim()) await syncMessageToPipedrive(agent, link.dealId, link.personId, "assistant", input.reply, input.channel);
    if (input.handoffReason !== null) await triggerPipedriveHandoff(agent, link.dealId, link.personId, input.handoffReason);
  } catch (error) {
    console.error("[pipedrive] sync", agentId, error instanceof Error ? error.message : error);
  }
}

export async function pauseChatsForPipedriveDeal(agentId: string, dealId: string) {
  if (!UUID_PATTERN.test(agentId) || !/^\d+$/.test(dealId)) return;
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_chat_links")
    .select("chat_id")
    .eq("agent_id", agentId)
    .eq("pipedrive_deal_id", Number(dealId));
  if (error) {
    console.error("[pipedrive] pause lookup", error.message);
    return;
  }
  for (const row of data ?? []) {
    const chatId = typeof row.chat_id === "string" ? row.chat_id : "";
    if (!UUID_PATTERN.test(chatId)) continue;
    try {
      await pauseBotForHandoff(supabase, chatId, "forever");
    } catch (failure) {
      console.error("[pipedrive] pause", failure instanceof Error ? failure.message : failure);
    }
  }
}

export async function loadPipedriveAgent(agentId: string): Promise<PipedriveAgent | null> {
  if (!UUID_PATTERN.test(agentId)) return null;
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("agents")
      .select("id, pipedrive_api_token, pipedrive_pipeline_id, pipedrive_handoff_stage_id")
      .eq("id", agentId)
      .maybeSingle();
    if (error || !data) return null;
    const token = typeof data.pipedrive_api_token === "string" ? data.pipedrive_api_token.trim() : "";
    if (!token) return null;
    return {
      id: String(data.id),
      token,
      pipelineId: idString(data.pipedrive_pipeline_id),
      handoffStageId: idString(data.pipedrive_handoff_stage_id),
    };
  } catch (error) {
    console.error("[pipedrive] load", error instanceof Error ? error.message : error);
    return null;
  }
}

async function findPerson(agent: PipedriveAgent, term: string) {
  const result = await pipedriveRequest(
    agent.token,
    `/persons/search?term=${encodeURIComponent(term)}&fields=phone,name&limit=1`,
  );
  if (!result.ok) return null;
  const items = asRecord(result.data).items;
  const first = Array.isArray(items) ? asRecord(asRecord(items[0]).item) : {};
  return idString(first.id) || null;
}

async function createPerson(agent: PipedriveAgent, client: PipedriveDealClient) {
  const name = (client.clientName || client.clientPhone || client.chatId || "Клиент").slice(0, 200);
  const body: Record<string, unknown> = { name };
  if (client.clientPhone) body.phone = [{ value: client.clientPhone, primary: true, label: "work" }];
  const result = await pipedriveRequest(agent.token, "/persons", { method: "POST", body });
  if (!result.ok) {
    console.error("[pipedrive] person", agent.id, result.error);
    return null;
  }
  return idString(asRecord(result.data).id) || null;
}

async function createDeal(agent: PipedriveAgent, client: PipedriveDealClient, personId: string) {
  const body: Record<string, unknown> = {
    title: dealTitle(client),
    person_id: Number(personId),
  };
  if (agent.pipelineId) body.pipeline_id = Number(agent.pipelineId);
  const result = await pipedriveRequest(agent.token, "/deals", { method: "POST", body });
  if (!result.ok) {
    console.error("[pipedrive] deal create", agent.id, result.error);
    return null;
  }
  return idString(asRecord(result.data).id) || null;
}

function dealTitle(client: PipedriveDealClient) {
  const who = client.clientName || client.clientPhone || client.chatId;
  return `Заявка из ${client.channel}: ${who}`.slice(0, 255);
}

async function readLink(agentId: string, channel: string, chatId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("crm_chat_links")
    .select("pipedrive_person_id, pipedrive_deal_id")
    .eq("agent_id", agentId)
    .eq("channel", channel)
    .eq("chat_id", chatId)
    .maybeSingle();
  if (error || !data) return null;
  const dealId = idString(data.pipedrive_deal_id);
  const personId = idString(data.pipedrive_person_id);
  if (!dealId) return null;
  return { dealId, personId };
}

async function saveLink(agentId: string, channel: string, chatId: string, ids: { personId: string; dealId: string }) {
  const supabase = createSupabaseAdminClient();
  const row = {
    pipedrive_person_id: Number(ids.personId),
    pipedrive_deal_id: Number(ids.dealId),
  };
  const { data: existing, error: readError } = await supabase
    .from("crm_chat_links")
    .select("id")
    .eq("agent_id", agentId)
    .eq("channel", channel)
    .eq("chat_id", chatId)
    .maybeSingle();
  if (readError) {
    console.error("[pipedrive] link", readError.message);
    return ids;
  }
  if (existing?.id) {
    const { error } = await supabase.from("crm_chat_links").update(row).eq("id", existing.id);
    if (error) console.error("[pipedrive] link", error.message);
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
    console.error("[pipedrive] link", error.message);
    return ids;
  }
  const { error: updateError } = await supabase
    .from("crm_chat_links")
    .update(row)
    .eq("agent_id", agentId)
    .eq("channel", channel)
    .eq("chat_id", chatId);
  if (updateError) console.error("[pipedrive] link", updateError.message);
  return ids;
}

async function pipedriveRequest(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: true; status: number; data: unknown } | { ok: false; status: number; error: string }> {
  if (!token.trim()) return { ok: false, status: 0, error: "Pipedrive не настроен." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        "x-api-token": token.trim(),
        Accept: "application/json",
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    if (response.status === 204) return { ok: true, status: 204, data: null };
    const payload = await response.json().catch(() => null);
    const record = asRecord(payload);
    if (!response.ok || record.success === false) {
      return { ok: false, status: response.status, error: pipedriveError(record, response.status) };
    }
    return { ok: true, status: response.status, data: "data" in record ? record.data : payload };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, status: 0, error: aborted ? "Таймаут 5 с" : "Pipedrive недоступен." };
  } finally {
    clearTimeout(timer);
  }
}

function pipedriveError(record: Record<string, unknown>, status: number) {
  if (status === 401 || status === 403) return "Токен отклонён. Проверьте API-токен Pipedrive.";
  if (typeof record.error_info === "string" && record.error_info.trim()) return record.error_info.trim();
  if (typeof record.error === "string" && record.error.trim()) return record.error.trim();
  return status ? `HTTP ${status}` : "Pipedrive недоступен.";
}

function readPipelines(pipelinesData: unknown, stagesData: unknown): PipedrivePipeline[] {
  const stages = (Array.isArray(stagesData) ? stagesData : []).map((item) => {
    const row = asRecord(item);
    const id = idString(row.id);
    const pipelineId = idString(row.pipeline_id);
    if (!id || !pipelineId) return null;
    return {
      id,
      pipelineId,
      name: text(row.name) || id,
    };
  }).filter((stage): stage is { id: string; pipelineId: string; name: string } => stage !== null);

  return (Array.isArray(pipelinesData) ? pipelinesData : []).map((item) => {
    const row = asRecord(item);
    const id = idString(row.id);
    if (!id) return null;
    return {
      id,
      name: text(row.name) || id,
      stages: stages.filter((stage) => stage.pipelineId === id).map(({ id: stageId, name }) => ({ id: stageId, name })),
    };
  }).filter((pipeline): pipeline is PipedrivePipeline => pipeline !== null);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
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
