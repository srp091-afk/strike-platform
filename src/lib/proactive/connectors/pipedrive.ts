import { contactKey } from "@/lib/proactive/contact-key";
import type { DataSourceAdapter, PostAction, SourceEntity } from "@/lib/proactive/connectors/types";

const API = "https://api.pipedrive.com/v1";
const LIMIT = 40;

type DealMode = "open" | "stale" | "overdue";

async function pipedrive(token: string, path: string, init?: { method?: string; body?: unknown }) {
  const response = await fetch(`${API}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "x-api-token": token,
      Accept: "application/json",
      ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(12000),
  });
  const payload = (await response.json().catch(() => null)) as { success?: boolean; error?: string; data?: unknown } | null;
  if (!response.ok || payload?.success === false) {
    throw new Error(response.status === 401 ? "Токен Pipedrive отклонён." : payload?.error || "Pipedrive недоступен.");
  }
  return payload?.data;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

function modeOf(config: Record<string, unknown>): DealMode {
  return config.mode === "stale" || config.mode === "overdue" ? config.mode : "open";
}

function tokenOf(config: Record<string, unknown>) {
  return typeof config.apiToken === "string" ? config.apiToken.trim() : "";
}

function firstValue(value: unknown) {
  if (!Array.isArray(value)) return "";
  return text(asRecord(value[0]).value);
}

export const pipedriveAdapter: DataSourceAdapter = {
  async testConnection(config) {
    const token = tokenOf(config);
    if (!token) return { ok: false, error: "Укажите API-токен Pipedrive." };
    try {
      const me = asRecord(await pipedrive(token, "/users/me"));
      return { ok: true, detail: text(me.name) || text(me.company_name) || "Pipedrive" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Pipedrive недоступен." };
    }
  },
  async fetchEntities(config) {
    const token = tokenOf(config);
    if (!token) throw new Error("Укажите API-токен Pipedrive.");
    if (modeOf(config) === "overdue") return overdueActivities(token);
    const deals = await pipedrive(token, `/deals?status=open&limit=${LIMIT}`);
    const list = Array.isArray(deals) ? deals : [];
    const staleDays = Math.min(90, Math.max(1, Number(config.staleDays) || 14));
    const cutoff = Date.now() - staleDays * 86_400_000;
    const selected =
      modeOf(config) === "stale" ? list.filter((deal) => Date.parse(text(asRecord(deal).update_time)) < cutoff) : list;
    const entities: SourceEntity[] = [];
    for (const deal of selected.slice(0, LIMIT)) {
      entities.push(await dealEntity(token, asRecord(deal)));
    }
    return entities;
  },
  async executePostAction(config, action, sent) {
    const token = tokenOf(config);
    const dealId = typeof action.deal_id === "string" ? action.deal_id : "";
    if (!token || !/^\d+$/.test(dealId)) return;
    if (action.add_note !== false) {
      const note = (action.note || `STRIKE AI отправил сообщение контакту ${sent.contact}: ${sent.message}`).slice(0, 2000);
      await pipedrive(token, "/notes", { method: "POST", body: { deal_id: Number(dealId), content: note } });
    }
    if (action.move_stage_id && /^\d+$/.test(action.move_stage_id)) {
      await pipedrive(token, `/deals/${dealId}`, { method: "PUT", body: { stage_id: Number(action.move_stage_id) } });
    }
  },
};

async function dealEntity(token: string, row: Record<string, unknown>): Promise<SourceEntity> {
  const personId = text(asRecord(row.person_id).value) || text(row.person_id);
  const person = personId ? asRecord(await pipedrive(token, `/persons/${encodeURIComponent(personId)}`).catch(() => null)) : {};
  const notes = await pipedrive(token, `/notes?deal_id=${encodeURIComponent(text(row.id))}&limit=3`).catch(() => []);
  const noteText = (Array.isArray(notes) ? notes : [])
    .map((note) => text(asRecord(note).content).replace(/<[^>]+>/g, " "))
    .filter(Boolean)
    .join("\n")
    .slice(0, 800);
  return {
    externalId: `deal:${text(row.id)}`,
    name: text(person.name) || text(row.person_name) || text(row.title) || "Сделка",
    phone: firstValue(person.phone),
    email: firstValue(person.email),
    telegram: "",
    context: [`Сделка: ${text(row.title)}`, `Сумма: ${text(row.value)} ${text(row.currency)}`, noteText].filter(Boolean).join("\n"),
    payload: {
      dealId: text(row.id),
      crmDealId: text(row.id),
      title: text(row.title),
      personId,
      contactKey: contactKey(firstValue(person.phone) || firstValue(person.email)) || `pd:${text(row.id)}`,
      updatedAt: text(row.update_time),
      crmStage: text(row.stage_id) ? `Стадия ${text(row.stage_id)}` : "",
    },
  };
}

async function overdueActivities(token: string) {
  const data = await pipedrive(token, `/activities?done=0&limit=${LIMIT}`);
  const today = new Date().toISOString().slice(0, 10);
  const list = (Array.isArray(data) ? data : []).filter((item) => {
    const due = text(asRecord(item).due_date);
    return due !== "" && due < today;
  });
  const entities: SourceEntity[] = [];
  for (const item of list.slice(0, LIMIT)) {
    const row = asRecord(item);
    const personId = text(row.person_id);
    const person = personId ? asRecord(await pipedrive(token, `/persons/${encodeURIComponent(personId)}`).catch(() => null)) : {};
    entities.push({
      externalId: `activity:${text(row.id)}`,
      name: text(person.name) || text(row.person_name) || "Контакт",
      phone: firstValue(person.phone),
      email: firstValue(person.email),
      telegram: "",
      context: `Просроченная задача: ${text(row.subject)}. Срок ${text(row.due_date)}. ${text(row.note)}`.slice(0, 2000),
      payload: { activityId: text(row.id), dealId: text(row.deal_id), personId },
    });
  }
  return entities;
}

export function withDeal(action: PostAction, payload: Record<string, string>): PostAction {
  return { ...action, deal_id: payload.dealId || action.deal_id || "" };
}
