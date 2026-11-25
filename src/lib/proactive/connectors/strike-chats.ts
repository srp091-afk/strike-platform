import "server-only";

import { contactKeyFromChat } from "@/lib/proactive/contact-key";
import type { DataSourceAdapter, SourceEntity } from "@/lib/proactive/connectors/types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const CHANNELS = new Set(["whatsapp", "telegram", "instagram"]);

function readList(value: unknown) {
  if (!Array.isArray(value)) return ["whatsapp", "telegram", "instagram"];
  const picked = value.map((item) => String(item)).filter((item) => CHANNELS.has(item));
  return picked.length > 0 ? picked : ["whatsapp"];
}

function hours(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const strikeChatsAdapter: DataSourceAdapter = {
  async testConnection(config) {
    const userId = String(config.userId ?? "");
    if (!userId) return { ok: false, error: "Источник чатов привязан к кабинету." };
    return { ok: true, detail: "Диалоги WhatsApp, Telegram и Instagram читаются из кабинета." };
  },
  async fetchEntities(config) {
    const userId = String(config.userId ?? "");
    if (!userId) return [];
    const agentId = String(config.agentId ?? "");
    const channels = readList(config.channels);
    const minSilence = hours(config.min_silence_hours, 4);
    const maxSilenceDays = hours(config.max_silence_days, 14);
    const now = Date.now();
    const newest = new Date(now - minSilence * 3_600_000).toISOString();
    const oldest = new Date(now - maxSilenceDays * 24 * 3_600_000).toISOString();
    const admin = createSupabaseAdminClient();
    let query = admin
      .from("conversations")
      .select("id, agent_id, external_chat_id, contact_name, contact_handle, last_message_at, push_count, is_waiting_for_user, integration:integrations(provider)")
      .eq("user_id", userId)
      .lte("last_message_at", newest)
      .gte("last_message_at", oldest)
      .order("last_message_at", { ascending: false })
      .limit(30);
    if (agentId && agentId !== "all") query = query.eq("agent_id", agentId);
    const rows = await query;
    if (rows.error) throw new Error(rows.error.message);

    const entities: SourceEntity[] = [];
    for (const row of rows.data ?? []) {
      const integration = Array.isArray(row.integration) ? row.integration[0] : row.integration;
      const provider = String(integration?.provider ?? "");
      if (!channels.includes(provider)) continue;
      const messages = await admin
        .from("messages")
        .select("role, content, created_at")
        .eq("conversation_id", row.id)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: false })
        .limit(18);
      const transcript = (messages.data ?? [])
        .reverse()
        .map((item) => `${item.role === "user" ? "Клиент" : "Агент"}: ${String(item.content ?? "").slice(0, 500)}`)
        .join("\n");
      if (!transcript) continue;
      const handle = String(row.contact_handle ?? "");
      const external = String(row.external_chat_id ?? "");
      entities.push({
        externalId: String(row.id),
        name: String(row.contact_name ?? handle ?? "Клиент"),
        phone: provider === "whatsapp" ? handle || external : "",
        email: handle.includes("@") ? handle : "",
        telegram: provider === "telegram" ? external : "",
        context: transcript,
        payload: {
          conversationId: String(row.id),
          contactKey: contactKeyFromChat(handle, external) || `chat:${row.id}`,
          lastMessageAt: String(row.last_message_at ?? ""),
          provider,
          pushCount: String(row.push_count ?? 0),
          waiting: row.is_waiting_for_user ? "1" : "0",
        },
      });
    }
    return entities;
  },
  async executePostAction() {},
};
