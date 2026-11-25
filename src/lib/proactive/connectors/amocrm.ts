import "server-only";

import { loadAmoAgent } from "@/lib/amocrm";
import type { DataSourceAdapter, SourceEntity } from "@/lib/proactive/connectors/types";

type AmoLead = {
  id?: number;
  name?: string;
  status_id?: number;
  closed_at?: number | null;
  updated_at?: number;
};

export const amoCrmAdapter: DataSourceAdapter = {
  async testConnection(config) {
    const agent = await loadAmoAgent(String(config.agentId ?? ""));
    if (!agent) return { ok: false, error: "У агента не подключён amoCRM." };
    const response = await fetch(`https://${agent.domain}/api/v4/account`, {
      headers: { authorization: `Bearer ${agent.token}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    return response?.ok ? { ok: true, detail: "amoCRM отвечает." } : { ok: false, error: "amoCRM не ответил." };
  },
  async fetchEntities(config) {
    const agent = await loadAmoAgent(String(config.agentId ?? ""));
    if (!agent) return [];
    const response = await fetch(`https://${agent.domain}/api/v4/leads?limit=30`, {
      headers: { authorization: `Bearer ${agent.token}`, accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("Не удалось прочитать сделки amoCRM.");
    const body = (await response.json()) as { _embedded?: { leads?: AmoLead[] } };
    return (body._embedded?.leads ?? [])
      .filter((lead) => !lead.closed_at)
      .map((lead) => {
        const id = String(lead.id ?? "");
        return {
          externalId: `amo:${id}`,
          name: String(lead.name ?? `Сделка ${id}`),
          phone: "",
          email: "",
          telegram: "",
          context: `Сделка amoCRM «${lead.name ?? id}», статус ${lead.status_id ?? ""}.`,
          payload: {
            dealId: id,
            crmDealId: id,
            crmStage: lead.status_id ? `Статус ${lead.status_id}` : "",
            contactKey: `amo:${id}`,
            updatedAt: lead.updated_at ? new Date(lead.updated_at * 1000).toISOString() : "",
          },
        } satisfies SourceEntity;
      });
  },
  async executePostAction(config, action, sent) {
    if (!action.add_note) return;
    const agent = await loadAmoAgent(String(config.agentId ?? ""));
    const leadId = action.deal_id ?? "";
    if (!agent || !/^\d+$/.test(leadId)) return;
    await fetch(`https://${agent.domain}/api/v4/leads/${leadId}/notes`, {
      method: "POST",
      headers: { authorization: `Bearer ${agent.token}`, "content-type": "application/json" },
      body: JSON.stringify([{ note_type: "common", params: { text: `STRIKE: ${sent.message.slice(0, 2000)}` } }]),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
  },
};
