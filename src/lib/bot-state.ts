import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

const MARKER_ON = "strike:bot:on";
const MARKER_OFF = "strike:bot:off";

export function isBotMarker(content: string) {
  return content === MARKER_ON || content === MARKER_OFF;
}

export async function readBotFlags(supabase: SupabaseClient, conversationIds: string[]) {
  const flags = new Map<string, boolean>();
  if (conversationIds.length === 0) return flags;

  const column = await supabase.from("conversations").select("id, is_bot_active").in("id", conversationIds);
  if (!column.error) {
    for (const row of column.data ?? []) {
      flags.set(row.id as string, row.is_bot_active !== false);
    }
    return flags;
  }

  if (!isMissingBotColumn(column.error.message)) {
    throw new Error(column.error.message);
  }

  const marks = await supabase
    .from("messages")
    .select("conversation_id, content, created_at")
    .in("conversation_id", conversationIds)
    .eq("role", "system")
    .in("content", [MARKER_ON, MARKER_OFF])
    .order("created_at", { ascending: false });

  if (marks.error) throw new Error(marks.error.message);

  for (const row of marks.data ?? []) {
    const id = row.conversation_id as string;
    if (flags.has(id)) continue;
    flags.set(id, row.content !== MARKER_OFF);
  }

  return flags;
}

export async function writeBotFlag(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
  active: boolean,
) {
  const update = await supabase
    .from("conversations")
    .update({ is_bot_active: active })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (!update.error) {
    if (!update.data) return { ok: false as const, error: "Диалог не найден." };
    return { ok: true as const };
  }

  if (!isMissingBotColumn(update.error.message)) {
    return { ok: false as const, error: update.error.message };
  }

  const owned = await supabase
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (owned.error) return { ok: false as const, error: owned.error.message };
  if (!owned.data) return { ok: false as const, error: "Диалог не найден." };

  const insert = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "system",
    content: active ? MARKER_ON : MARKER_OFF,
    status: "sent",
  });

  if (insert.error) return { ok: false as const, error: insert.error.message };
  return { ok: true as const };
}

function isMissingBotColumn(message: string) {
  return message.includes("is_bot_active") && (message.includes("does not exist") || message.includes("schema cache"));
}
