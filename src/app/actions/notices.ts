"use server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { isNoticeReadKey } from "@/lib/notification-reads";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

/** Пишет прочтение только для вошедшего пользователя. Id кабинета из формы не принимается. */
export async function markNoticesRead(keys: string[]) {
  const unique = [...new Set(keys.filter(isNoticeReadKey))].slice(0, 30);
  if (unique.length === 0) return { ok: true as const };
  try {
    const userId = await getAuthenticatedUserId();
    const admin = createSupabaseAdminClient();
    const readAt = new Date().toISOString();
    const { error } = await admin.from("user_notification_reads").upsert(
      unique.map((notification_key) => ({ user_id: userId, notification_key, read_at: readAt })),
      { onConflict: "user_id,notification_key" },
    );
    if (error) return { ok: false as const };
    return { ok: true as const };
  } catch {
    return { ok: false as const };
  }
}
