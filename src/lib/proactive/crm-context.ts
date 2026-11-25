import "server-only";

import { loadAmoAgent } from "@/lib/amocrm";
import { loadPipedriveAgent } from "@/lib/pipedrive";

export type CrmSnapshot = {
  connected: boolean;
  dealId: string;
  stage: string;
  closed: boolean;
  touchedRecently: boolean;
  notes: string;
};

const EMPTY: CrmSnapshot = { connected: false, dealId: "", stage: "", closed: false, touchedRecently: false, notes: "" };

/** Пустой снимок, если у агента нет ни Pipedrive, ни amoCRM. Тогда планировщик к CRM не обращается. */
export async function readCrmSnapshot(agentId: string, conversationId: string, cooldownHours: number): Promise<CrmSnapshot> {
  const [pipedrive, amo] = await Promise.all([loadPipedriveAgent(agentId), loadAmoAgent(agentId)]);
  if (!pipedrive && !amo) return EMPTY;

  const { createSupabaseAdminClient } = await import("@/lib/supabase-admin");
  const admin = createSupabaseAdminClient();
  const link = await admin
    .from("crm_chat_links")
    .select("pipedrive_deal_id, amo_lead_id")
    .eq("agent_id", agentId)
    .eq("chat_id", conversationId)
    .limit(1);
  if (link.error || !link.data?.[0]) return { ...EMPTY, connected: true };
  const row = link.data[0];

  if (pipedrive && row.pipedrive_deal_id) {
    return readPipedrive(pipedrive.token, String(row.pipedrive_deal_id), cooldownHours);
  }
  if (amo && row.amo_lead_id) {
    return readAmo(amo.domain, amo.token, String(row.amo_lead_id), cooldownHours);
  }
  return { ...EMPTY, connected: true };
}

async function readPipedrive(token: string, dealId: string, cooldownHours: number): Promise<CrmSnapshot> {
  const response = await fetch(`https://api.pipedrive.com/v1/deals/${encodeURIComponent(dealId)}`, {
    headers: { "x-api-token": token, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return { ...EMPTY, connected: true, dealId };
  const body = (await response.json()) as { data?: { status?: string; stage_id?: number; update_time?: string; title?: string } };
  const deal = body.data ?? {};
  const status = String(deal.status ?? "");
  return {
    connected: true,
    dealId,
    stage: status === "open" ? `Стадия ${deal.stage_id ?? ""}` : status,
    closed: status === "won" || status === "lost",
    touchedRecently: recent(deal.update_time, cooldownHours),
    notes: String(deal.title ?? ""),
  };
}

async function readAmo(domain: string, token: string, leadId: string, cooldownHours: number): Promise<CrmSnapshot> {
  const response = await fetch(`https://${domain}/api/v4/leads/${encodeURIComponent(leadId)}`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return { ...EMPTY, connected: true, dealId: leadId };
  const lead = (await response.json()) as { name?: string; status_id?: number; closed_at?: number | null; updated_at?: number };
  const closedAt = Number(lead.closed_at ?? 0);
  return {
    connected: true,
    dealId: leadId,
    stage: lead.status_id ? `Статус ${lead.status_id}` : "",
    closed: closedAt > 0,
    touchedRecently: lead.updated_at ? Date.now() - lead.updated_at * 1000 < cooldownHours * 3_600_000 : false,
    notes: String(lead.name ?? ""),
  };
}

function recent(value: string | undefined, cooldownHours: number) {
  if (!value) return false;
  const stamp = Date.parse(value.includes("T") ? value : value.replace(" ", "T") + "Z");
  return Number.isFinite(stamp) && Date.now() - stamp < cooldownHours * 3_600_000;
}

export async function recentChatContext(userId: string, contactKey: string) {
  if (!contactKey) return "";
  const { createSupabaseAdminClient } = await import("@/lib/supabase-admin");
  const admin = createSupabaseAdminClient();
  const chats = await admin
    .from("conversations")
    .select("id, contact_handle, external_chat_id, last_message_at")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(40);
  const match = (chats.data ?? []).find((row) => {
    const handle = String(row.contact_handle ?? "").replace(/\D/g, "");
    const external = String(row.external_chat_id ?? "").replace(/\D/g, "");
    return handle === contactKey || external.startsWith(contactKey);
  });
  if (!match) return "";
  const messages = await admin
    .from("messages")
    .select("role, content")
    .eq("conversation_id", match.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(16);
  const lines = (messages.data ?? [])
    .reverse()
    .map((row) => `${row.role === "user" ? "Клиент" : "Агент"}: ${String(row.content ?? "").slice(0, 400)}`)
    .join("\n");
  return lines ? `Последние сообщения WhatsApp/мессенджера:\n${lines}` : "";
}
