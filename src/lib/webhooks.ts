import "server-only";

import { createHmac } from "node:crypto";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 5000;

export type WebhookAgent = {
  id: string;
  name: string;
  webhook_url: string;
  webhook_secret: string | null;
};

export type AgentWebhookPayload = {
  event: string;
  channel: string;
  chat_id: string;
  client: { name: string | null; phone: string | null; username: string | null };
  message: { role: "user" | "assistant" | "system"; text: string };
  metadata?: Record<string, unknown>;
  status?: "active" | "handoff";
};

export type WebhookDeliveryResult = { ok: boolean; status: number; error?: string };

/** Агент с настроенным http(s) URL. Ошибка схемы или сети не роняет диалог. */
export async function loadAgentWebhook(agentId: string): Promise<WebhookAgent | null> {
  if (!UUID_PATTERN.test(agentId)) return null;
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("agents")
      .select("id, name, webhook_url, webhook_secret")
      .eq("id", agentId)
      .maybeSingle();
    if (error || !data) return null;
    const url = typeof data.webhook_url === "string" ? data.webhook_url.trim() : "";
    if (!isHttpUrl(url)) return null;
    const secret = typeof data.webhook_secret === "string" ? data.webhook_secret.trim() : "";
    return {
      id: String(data.id),
      name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : "Агент",
      webhook_url: url,
      webhook_secret: secret || null,
    };
  } catch (error) {
    console.error("[webhook] load", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * POST события диалога. Пустой или не-http URL — тихий выход.
 * Таймаут 5 с. Любой сбой внешнего сервера только пишется в лог и не пробрасывается.
 */
export async function dispatchAgentWebhook(agent: WebhookAgent, payload: AgentWebhookPayload): Promise<WebhookDeliveryResult> {
  try {
    const result = await postAgentWebhook(agent, payload);
    if (!result.ok && result.error && result.error !== "skipped") {
      console.error("[webhook]", agent.id, payload.event, result.status || "", result.error);
    }
    return result.error === "skipped" ? { ok: false, status: 0 } : result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить вебхук.";
    console.error("[webhook]", agent.id, payload.event, message);
    return { ok: false, status: 0, error: message };
  }
}

/** Та же доставка, но результат нужен кнопке «Отправить тест». */
export async function postAgentWebhook(
  agent: { id: string; name: string; webhook_url: string; webhook_secret: string | null },
  payload: AgentWebhookPayload,
): Promise<WebhookDeliveryResult & { error?: string }> {
  const url = agent.webhook_url.trim();
  if (!isHttpUrl(url)) return { ok: false, status: 0, error: "skipped" };

  const body = JSON.stringify({
    event: payload.event,
    timestamp: new Date().toISOString(),
    agent: {
      id: agent.id,
      name: agent.name,
      status: payload.status ?? "active",
    },
    channel: payload.channel,
    chat_id: payload.chat_id,
    client: payload.client,
    message: payload.message,
    metadata: payload.metadata ?? {},
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const secret = agent.webhook_secret?.trim();
  if (secret) headers["X-Strike-Signature"] = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "POST", headers, body, signal: controller.signal });
    if (!response.ok) return { ok: false, status: response.status, error: `HTTP ${response.status}` };
    return { ok: true, status: response.status };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, status: 0, error: aborted ? "Таймаут 5 с" : error instanceof Error ? error.message : "Не удалось отправить вебхук." };
  } finally {
    clearTimeout(timer);
  }
}

export function isHttpUrl(value: string) {
  return value.startsWith("http://") || value.startsWith("https://");
}
