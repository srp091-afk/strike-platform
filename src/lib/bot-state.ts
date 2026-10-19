import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { handoffPauseUntil, isBotPauseActive, type HandoffDuration } from "@/lib/agent-models";

const MARKER_ON = "strike:bot:on";
const MARKER_OFF = "strike:bot:off";

export function isBotMarker(content: string) {
  return content === MARKER_ON || content === MARKER_OFF;
}

export async function readBotFlags(supabase: SupabaseClient, conversationIds: string[]) {
  const flags = new Map<string, boolean>();
  if (conversationIds.length === 0) return flags;

  const paused = await supabase.from("conversations").select("id, bot_paused_until").in("id", conversationIds);
  if (!paused.error) {
    for (const row of paused.data ?? []) {
      flags.set(row.id as string, !isBotPauseActive(row.bot_paused_until));
    }
    return flags;
  }

  if (!isMissingColumn(paused.error.message, "bot_paused_until")) {
    throw new Error(paused.error.message);
  }

  const column = await supabase.from("conversations").select("id, is_bot_active").in("id", conversationIds);
  if (!column.error) {
    for (const row of column.data ?? []) {
      flags.set(row.id as string, row.is_bot_active !== false);
    }
    return flags;
  }

  if (!isMissingColumn(column.error.message, "is_bot_active")) {
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
  const until = active ? null : handoffPauseUntil("forever");
  // Single round-trip: pause column + legacy flag together when both exist.
  const update = await supabase
    .from("conversations")
    .update({ bot_paused_until: until, is_bot_active: active })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (!update.error) {
    if (!update.data) return { ok: false as const, error: "Диалог не найден." };
    return { ok: true as const };
  }

  if (
    isMissingColumn(update.error.message, "bot_paused_until") ||
    isMissingColumn(update.error.message, "is_bot_active")
  ) {
    const onlyPause = await supabase
      .from("conversations")
      .update({ bot_paused_until: until })
      .eq("id", conversationId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (!onlyPause.error) {
      if (!onlyPause.data) return { ok: false as const, error: "Диалог не найден." };
      return { ok: true as const };
    }

    if (!isMissingColumn(onlyPause.error.message, "bot_paused_until")) {
      return { ok: false as const, error: onlyPause.error.message };
    }
  } else {
    return { ok: false as const, error: update.error.message };
  }

  const legacy = await supabase
    .from("conversations")
    .update({ is_bot_active: active })
    .eq("id", conversationId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (!legacy.error) {
    if (!legacy.data) return { ok: false as const, error: "Диалог не найден." };
    return { ok: true as const };
  }

  if (!isMissingColumn(legacy.error.message, "is_bot_active")) {
    return { ok: false as const, error: legacy.error.message };
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

function positiveLimit(value: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export async function pauseIfDialogueOverLimit(
  supabase: SupabaseClient,
  conversationId: string,
  limits: { agent: number; client: number; total: number },
) {
  const agentLimit = positiveLimit(limits.agent);
  const clientLimit = positiveLimit(limits.client);
  const totalLimit = positiveLimit(limits.total);
  if (agentLimit === 0 && clientLimit === 0 && totalLimit === 0) return false;

  const needAgent = agentLimit > 0 || (totalLimit > 0 && clientLimit > 0);
  const needClient = clientLimit > 0 || (totalLimit > 0 && agentLimit > 0);
  const [agentCount, clientCount, totalCount] = await Promise.all([
    needAgent ? countMessages(supabase, conversationId, "assistant") : Promise.resolve(0),
    needClient ? countMessages(supabase, conversationId, "user") : Promise.resolve(0),
    !needAgent && !needClient && totalLimit > 0
      ? countMessages(supabase, conversationId, null)
      : Promise.resolve(0),
  ]);
  const total = needAgent || needClient ? agentCount + clientCount : totalCount;

  const overLimit =
    (agentLimit > 0 && agentCount >= agentLimit) ||
    (clientLimit > 0 && clientCount >= clientLimit) ||
    (totalLimit > 0 && total >= totalLimit);
  if (!overLimit) return false;

  await pauseBotForHandoff(supabase, conversationId, "forever");
  return true;
}

async function countMessages(
  supabase: SupabaseClient,
  conversationId: string,
  role: "user" | "assistant" | null,
) {
  let query = supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  query = role ? query.eq("role", role) : query.in("role", ["user", "assistant"]);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function pauseBotForHandoff(
  supabase: SupabaseClient,
  conversationId: string,
  duration: HandoffDuration,
) {
  const update = await supabase
    .from("conversations")
    .update({ bot_paused_until: handoffPauseUntil(duration), is_bot_active: false })
    .eq("id", conversationId);

  if (!update.error) return;
  if (!isMissingColumn(update.error.message, "is_bot_active")) {
    if (isMissingColumn(update.error.message, "bot_paused_until")) return;
    throw new Error(update.error.message);
  }

  const retry = await supabase
    .from("conversations")
    .update({ bot_paused_until: handoffPauseUntil(duration) })
    .eq("id", conversationId);
  if (retry.error && !isMissingColumn(retry.error.message, "bot_paused_until")) {
    throw new Error(retry.error.message);
  }
}

function isMissingColumn(message: string, column: string) {
  return message.includes(column) && (message.includes("does not exist") || message.includes("schema cache"));
}
