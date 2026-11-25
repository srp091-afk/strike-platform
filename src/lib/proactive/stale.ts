import "server-only";

import { contactKeyFromChat } from "@/lib/proactive/contact-key";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { SupabaseClient } from "@supabase/supabase-js";

const ACTIVE = ["pending_approval", "scheduled", "sending"];
const STALE_REASON = "Клиент написал новое сообщение — задача снята с отправки";

/** Снимает висящие задачи, если в диалоге появилось новое сообщение. Ошибка таблицы не роняет вебхук. */
export async function retireTasksForConversation(
  supabase: SupabaseClient,
  input: { userId: string; conversationId: string; contact?: string; reason?: string },
) {
  try {
    const key = contactKeyFromChat(input.contact ?? "", "");
    let query = supabase
      .from("agent_action_queue")
      .update({ status: "stale", error_message: input.reason ?? STALE_REASON })
      .eq("user_id", input.userId)
      .in("status", ["pending_approval", "scheduled"]);
    query = key
      ? query.or(`conversation_id.eq.${input.conversationId},contact_key.eq.${key}`)
      : query.eq("conversation_id", input.conversationId);
    const { error } = await query;
    if (error && !/agent_action_queue|contact_key|conversation_id/.test(error.message)) {
      console.error("[proactive stale]", error.message);
    }
  } catch (error) {
    console.error("[proactive stale]", error instanceof Error ? error.message : error);
  }
}

export async function dialogIsStale(input: { conversationId: string | null; snapshot: string | null }) {
  if (!input.conversationId || !input.snapshot) return false;
  const admin = createSupabaseAdminClient();
  const row = await admin.from("conversations").select("last_message_at").eq("id", input.conversationId).maybeSingle();
  const latest = typeof row.data?.last_message_at === "string" ? row.data.last_message_at : "";
  if (!latest) return false;
  return Date.parse(latest) > Date.parse(input.snapshot) + 1000;
}

export { ACTIVE };
