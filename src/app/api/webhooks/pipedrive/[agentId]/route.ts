import { connection } from "next/server";

import { loadPipedriveAgent, pauseChatsForPipedriveDeal } from "@/lib/pipedrive";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OWN_NOTE = /[👤🤖⚠️]/u;

/** Pipedrive отключает вебхук при ответе не 200. Ошибки только в лог. */
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  await connection();
  try {
    const { agentId } = await params;
    if (UUID_PATTERN.test(agentId)) await applyPipedriveWebhook(agentId, await request.json().catch(() => null));
  } catch (error) {
    console.error("[pipedrive webhook]", error instanceof Error ? error.message : error);
  }
  return new Response("OK", { status: 200 });
}

async function applyPipedriveWebhook(agentId: string, payload: unknown) {
  const body = asRecord(payload);
  const meta = asRecord(body.meta);
  const current = asRecord(body.current);
  const data = asRecord(body.data);
  const event = eventName(body, meta);
  const record = Object.keys(data).length > 0 ? data : current;

  if (/^(?:updated|changed|change)\.deal$/i.test(event)) {
    const agent = await loadPipedriveAgent(agentId);
    const stageId = idString(record.stage_id);
    const dealId = idString(record.id) || idString(meta.entity_id) || idString(meta.id);
    if (agent?.handoffStageId && stageId === agent.handoffStageId && dealId) {
      await pauseChatsForPipedriveDeal(agentId, dealId);
    }
    return;
  }

  if (/^(?:added|add|created|create)\.note$/i.test(event)) {
    const content = typeof record.content === "string" ? record.content : "";
    const dealId = idString(record.deal_id);
    if (!dealId || OWN_NOTE.test(content)) return;
    await pauseChatsForPipedriveDeal(agentId, dealId);
  }
}

function eventName(body: Record<string, unknown>, meta: Record<string, unknown>) {
  if (typeof body.event === "string" && body.event.includes(".")) return body.event.trim();
  const action = typeof meta.action === "string" ? meta.action.trim() : "";
  const object = typeof meta.object === "string" ? meta.object.trim() : typeof meta.entity === "string" ? meta.entity.trim() : "";
  if (action.includes(".")) return action;
  if (action && object) return `${action}.${object}`;
  return action;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function idString(value: unknown) {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  return "";
}
