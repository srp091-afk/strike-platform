import { connection } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { TWILIO_NOT_CONNECTED, twilioAccountForUser } from "@/lib/twilio-account";
import { fetchApprovalStatus, type TemplateStatus } from "@/lib/twilio-content";

const COLUMNS = "id, name, language, body, twilio_content_sid, status, created_at, updated_at";

type TemplateRow = {
  id: string;
  twilio_content_sid: string;
  status: TemplateStatus;
};

/** Сверяет pending-шаблоны пользователя со статусом модерации WhatsApp в Twilio. */
export async function GET() {
  await connection();
  try {
    const userId = await getAuthenticatedUserId();
    const twilio = await twilioAccountForUser(userId);
    if ("error" in twilio) return Response.json({ error: twilio.error }, { status: 500 });
    if (!twilio.account) return Response.json({ error: TWILIO_NOT_CONNECTED }, { status: 400 });

    const supabase = createSupabaseAdminClient();
    const { data: pending, error: pendingError } = await supabase
      .from("whatsapp_templates")
      .select("id, twilio_content_sid, status")
      .eq("user_id", userId)
      .eq("status", "pending");
    if (pendingError) {
      const missing = /whatsapp_templates/.test(pendingError.message);
      return Response.json(
        { error: missing ? "Примените миграцию 20261119_whatsapp_templates.sql." : pendingError.message },
        { status: 500 },
      );
    }

    for (const row of (pending ?? []) as TemplateRow[]) {
      const result = await fetchApprovalStatus(twilio.account, row.twilio_content_sid);
      if ("error" in result || result.status === row.status) continue;
      await supabase
        .from("whatsapp_templates")
        .update({ status: result.status, updated_at: new Date().toISOString() })
        .eq("id", row.id)
        .eq("user_id", userId);
    }

    const { data, error } = await supabase
      .from("whatsapp_templates")
      .select(COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ templates: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось синхронизировать шаблоны.";
    return Response.json({ error: message }, { status: message === "Нужно войти через Google." ? 401 : 500 });
  }
}
