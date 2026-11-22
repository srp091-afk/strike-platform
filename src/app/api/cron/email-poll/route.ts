import type { NextRequest } from "next/server";

import { pollAgentInbox } from "@/lib/email-channel";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

const COLUMNS =
  "id, user_id, name, system_prompt, model, temperature, is_active, split_messages, limit_agent_messages, limit_client_messages, limit_total_messages, email_address, email_password, email_imap_host, email_imap_port, email_smtp_host, email_smtp_port, email_last_uid";

/**
 * Каждые 2 минуты читает новые письма агентов с включённой почтой.
 * Vercel сам шлёт `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return Response.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("agents").select(COLUMNS).eq("email_enabled", true).not("email_address", "is", null);
  if (error) {
    const message = /email_|schema cache/i.test(error.message) ? "Примените миграцию 20261122_agent_viber_email.sql." : error.message;
    console.error("[cron email]", message);
    return Response.json({ ok: false, error: message }, { status: 500 });
  }

  const deadline = Date.now() + 50_000;
  let checked = 0;
  let failed = 0;
  for (const agent of data ?? []) {
    if (Date.now() >= deadline) break;
    checked += 1;
    try {
      await pollAgentInbox(supabase, agent);
    } catch (failure) {
      failed += 1;
      console.error("[cron email]", agent.id, failure instanceof Error ? failure.message : failure);
    }
  }
  return Response.json({ ok: true, checked, failed });
}
