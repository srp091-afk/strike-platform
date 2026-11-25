import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[a-z0-9-]{1,120}$/i;

export function isNoticeReadKey(value: string) {
  return KEY_PATTERN.test(value);
}

/** Какие из переданных ключей этот пользователь уже открывал. Чужие строки не читаются. */
export async function readNotificationReads(userId: string, keys: string[]) {
  const wanted = keys.filter(isNoticeReadKey);
  if (!userId || wanted.length === 0) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_notification_reads")
    .select("notification_key")
    .eq("user_id", userId)
    .in("notification_key", wanted);
  if (error) return [];
  return (data ?? []).map((row) => String(row.notification_key));
}
