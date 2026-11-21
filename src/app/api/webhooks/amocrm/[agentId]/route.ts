import { connection } from "next/server";

import { pauseChatsForAmoLead, loadAmoAgent } from "@/lib/amocrm";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWN_NOTE = /^(?:👤|🤖|⚠️)/u;

/** amoCRM отключает вебхук, если ответ не 200. Ошибки только в лог. */
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  await connection();
  try {
    const { agentId } = await params;
    if (UUID_PATTERN.test(agentId)) await applyAmoWebhook(agentId, await request.text());
  } catch (error) {
    console.error("[amocrm webhook]", error instanceof Error ? error.message : error);
  }
  return new Response("OK", { status: 200 });
}

async function applyAmoWebhook(agentId: string, raw: string) {
  const params = new URLSearchParams(raw);
  const agent = await loadAmoAgent(agentId);
  const handoffStatus = agent?.handoffStatusId ?? "";

  const fields = new Map<string, string>();
  for (const [key, value] of params.entries()) {
    const status = key.match(/^leads\[status\]\[(\d+)\]\[(id|status_id)\]$/);
    if (status) fields.set(`status:${status[1]}:${status[2]}`, value);
    const noteText = key.match(/^leads\[note\]\[(\d+)\]\[(?:note\]\[)?text\]$/);
    if (noteText) fields.set(`note:${noteText[1]}:text`, value);
    const noteLead = key.match(/^leads\[note\]\[(\d+)\]\[(?:note\]\[)?element_id\]$/);
    if (noteLead) fields.set(`note:${noteLead[1]}:lead`, value);
  }

  const indexes = new Set<string>();
  for (const key of fields.keys()) {
    const match = key.match(/^(?:status|note):(\d+)/);
    if (match?.[1]) indexes.add(match[1]);
  }

  for (const index of indexes) {
    const leadId = fields.get(`status:${index}:id`) ?? "";
    const statusId = fields.get(`status:${index}:status_id`) ?? "";
    if (leadId && handoffStatus && statusId === handoffStatus) await pauseChatsForAmoLead(agentId, leadId);
  }

  for (const index of indexes) {
    const text = (fields.get(`note:${index}:text`) ?? "").trim();
    const leadId = fields.get(`note:${index}:lead`) ?? "";
    if (!text || !leadId || OWN_NOTE.test(text)) continue;
    await pauseChatsForAmoLead(agentId, leadId);
  }
}
