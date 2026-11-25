import "server-only";

import { contactKeyFromChat } from "@/lib/proactive/contact-key";
import type { SupabaseClient } from "@supabase/supabase-js";

const ACTIVE = ["pending_approval", "scheduled", "sending"] as const;

/** Встроенный follow-up молчит, если по этому человеку уже есть задача ИИ или кампания перехватила дожим. */
export async function builtinFollowupBlocked(
  supabase: SupabaseClient,
  input: { userId: string; agentId: string; conversationId: string; handle: string; externalId: string },
) {
  const override = await supabase
    .from("proactive_campaigns")
    .select("id")
    .eq("user_id", input.userId)
    .eq("agent_id", input.agentId)
    .eq("status", "active")
    .eq("followup_conflict_mode", "override_builtin")
    .limit(1);
  if (override.error) return false;
  if ((override.data ?? []).length > 0) return true;

  const key = contactKeyFromChat(input.handle, input.externalId);
  const active = await supabase
    .from("agent_action_queue")
    .select("id, contact_key, conversation_id, status, sent_at")
    .eq("user_id", input.userId)
    .in("status", [...ACTIVE, "sent"])
    .order("created_at", { ascending: false })
    .limit(80);
  if (active.error) return false;
  const cutoff = Date.now() - 24 * 3_600_000;
  return (active.data ?? []).some((row) => {
    const same = row.conversation_id === input.conversationId || (key && row.contact_key === key);
    if (!same) return false;
    if (ACTIVE.includes(row.status as (typeof ACTIVE)[number])) return true;
    const sentAt = typeof row.sent_at === "string" ? Date.parse(row.sent_at) : 0;
    return row.status === "sent" && sentAt >= cutoff;
  });
}
