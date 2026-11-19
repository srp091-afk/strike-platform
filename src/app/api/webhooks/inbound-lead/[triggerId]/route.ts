import { connection, type NextRequest } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { TWILIO_NOT_CONNECTED, twilioAccountForUser } from "@/lib/twilio-account";
import { sendTemplateMessage } from "@/lib/twilio-content";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type FieldRule = { source?: unknown; value?: unknown };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, max: number) {
  const raw = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
  return raw.slice(0, max);
}

function ruleValue(rule: FieldRule, payload: Record<string, unknown>) {
  if (rule.source === "static") return text(rule.value, 1000);
  if (rule.source !== "payload") return "";
  const key = typeof rule.value === "string" ? rule.value : "";
  return key ? text(payload[key], 1000) : "";
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Принимает сырой JSON Tilda или Make, отправляет шаблон и открывает сессию лида. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ triggerId: string }> }) {
  await connection();
  const { triggerId } = await params;
  if (!UUID_PATTERN.test(triggerId)) {
    return Response.json({ error: "Триггер не найден." }, { status: 404 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("webhook_triggers")
    .select("id, agent_id, is_active, mapping_config, agents(id, user_id), whatsapp_templates(twilio_content_sid)")
    .eq("id", triggerId)
    .maybeSingle();
  if (error) {
    const missing = /webhook_triggers|whatsapp_templates/.test(error.message);
    return Response.json(
      { error: missing ? "Примените миграции lead_sessions, whatsapp_templates и webhook_triggers." : error.message },
      { status: 500 },
    );
  }

  const template = one(data?.whatsapp_templates as { twilio_content_sid: string } | { twilio_content_sid: string }[] | null);
  const agent = one(data?.agents as { id: string; user_id: string } | { id: string; user_id: string }[] | null);
  const contentSid = template?.twilio_content_sid?.trim() ?? "";
  if (!data || data.is_active !== true || !agent || !contentSid) {
    return Response.json({ error: "Триггер не найден." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный JSON." }, { status: 400 });
  }

  const payload = asRecord(body);
  const mapping = asRecord(data.mapping_config);
  const phoneRaw = ruleValue(asRecord(mapping.phone) as FieldRule, payload);
  const phoneDigits = phoneRaw.replace(/\D/g, "").slice(0, 15);
  if (asRecord(mapping.phone).source !== "payload" || phoneDigits.length < 8) {
    return Response.json({ error: "В заявке нет номера телефона." }, { status: 400 });
  }

  const variables: Record<string, string> = {};
  for (const [key, rule] of Object.entries(asRecord(mapping.variables))) {
    if (!/^\d+$/.test(key)) continue;
    const value = ruleValue(asRecord(rule) as FieldRule, payload);
    if (!value) return Response.json({ error: `Не найдено значение переменной {{${key}}}.` }, { status: 400 });
    variables[key] = value;
  }

  const twilio = await twilioAccountForUser(agent.user_id);
  if ("error" in twilio) return Response.json({ error: twilio.error }, { status: 500 });
  if (!twilio.account) return Response.json({ error: TWILIO_NOT_CONNECTED }, { status: 400 });

  const sent = await sendTemplateMessage(twilio.account, { phoneDigits, contentSid, variables });
  if ("error" in sent) {
    console.error("[inbound-lead] twilio", sent.error);
    return Response.json({ error: "Не удалось отправить шаблон WhatsApp." }, { status: 500 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("lead_sessions")
    .insert({
      agent_id: data.agent_id,
      phone: `+${phoneDigits}`,
      lead_data: body && typeof body === "object" ? body : { value: body },
      status: "waiting_for_reply",
    })
    .select("id")
    .single();
  if (sessionError) {
    console.error("[inbound-lead] session", sessionError.message);
    return Response.json({ error: "Шаблон отправлен, но сессию лида сохранить не удалось." }, { status: 500 });
  }

  return Response.json({ status: "template_sent", id: session.id });
}
