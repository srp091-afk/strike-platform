import { connection, type NextRequest } from "next/server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { TWILIO_NOT_CONNECTED, twilioAccountForUser } from "@/lib/twilio-account";
import { createTextContent, deleteContent, submitWhatsAppApproval, templateVariables } from "@/lib/twilio-content";

const NAME_PATTERN = /^[a-z0-9_]+$/;
const LANGUAGE_PATTERN = /^[a-z]{2}(_[A-Z]{2})?$/;

function text(value: unknown, max: number) {
  return (typeof value === "string" ? value.trim() : "").slice(0, max);
}

function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : "Не удалось создать шаблон.";
  return Response.json({ error: message }, { status: message === "Нужно войти через Google." ? 401 : status });
}

/** Создаёт twilio/text, отправляет его на модерацию WhatsApp и сохраняет сессию шаблона. */
export async function POST(request: NextRequest) {
  await connection();
  try {
    const userId = await getAuthenticatedUserId();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Некорректный JSON." }, { status: 400 });
    }

    const input = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const name = text(input.name, 512);
    const language = text(input.language, 8);
    const templateBody = text(input.body, 1600);
    if (!NAME_PATTERN.test(name)) {
      return Response.json({ error: "Имя шаблона: строчные латинские буквы, цифры и подчёркивание, без пробелов." }, { status: 400 });
    }
    if (!LANGUAGE_PATTERN.test(language)) {
      return Response.json({ error: "Код языка должен быть вида ru или en." }, { status: 400 });
    }
    if (!templateBody) return Response.json({ error: "Укажите текст шаблона." }, { status: 400 });

    const variables = templateVariables(templateBody);
    if ("error" in variables) return Response.json({ error: variables.error }, { status: 400 });

    const twilio = await twilioAccountForUser(userId);
    if ("error" in twilio) return Response.json({ error: twilio.error }, { status: 500 });
    if (!twilio.account) return Response.json({ error: TWILIO_NOT_CONNECTED }, { status: 400 });

    const created = await createTextContent(twilio.account, { name, language, body: templateBody, variables: variables.variables });
    if ("error" in created) return Response.json({ error: created.error }, { status: 502 });

    const approval = await submitWhatsAppApproval(twilio.account, created.sid, name);
    if ("error" in approval) {
      await deleteContent(twilio.account, created.sid);
      return Response.json({ error: approval.error }, { status: 502 });
    }

    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("whatsapp_templates")
      .insert({
        user_id: userId,
        name,
        language,
        body: templateBody,
        twilio_content_sid: created.sid,
        status: "pending",
      })
      .select("id, name, language, body, twilio_content_sid, status, created_at, updated_at")
      .single();
    if (error) {
      await deleteContent(twilio.account, created.sid);
      const missing = /whatsapp_templates/.test(error.message);
      return Response.json(
        { error: missing ? "Примените миграцию 20261119_whatsapp_templates.sql." : error.message },
        { status: 500 },
      );
    }

    return Response.json({ template: data });
  } catch (error) {
    return fail(error);
  }
}
