import { createHmac, timingSafeEqual } from "node:crypto";

import { after, connection, type NextRequest } from "next/server";

import { normalizeAgentModel } from "@/lib/agent-models";
import { getOpenAI } from "@/lib/openai";
import { stripMarkdown, systemPromptWithSplit } from "@/lib/reply";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { canonicalWhatsappNumber, twilioAccountForNumber } from "@/lib/twilio-account";
import { sendTextMessage } from "@/lib/twilio-content";

export const maxDuration = 60;

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function received() {
  return new Response(EMPTY_TWIML, { status: 200, headers: { "Content-Type": "text/xml" } });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function clampTemperature(value: unknown) {
  const temperature = Number(value);
  if (!Number.isFinite(temperature)) return 0.7;
  return Math.min(2, Math.max(0, temperature));
}

function leadContext(data: unknown) {
  const labels: Record<string, string> = { name: "Имя", Name: "Имя", form_name: "Форма", form: "Форма", Form: "Форма" };
  const parts: string[] = [];
  for (const [key, value] of Object.entries(asRecord(data))) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const text = String(value).trim().slice(0, 300);
    if (!text) continue;
    parts.push(`${labels[key] ?? key} - ${text}`);
  }
  const line = parts.join(", ").slice(0, 1500);
  return line ? `Контекст лида: ${line}` : "";
}

function signatureUrls(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const urls = new Set<string>();
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
  if (forwardedHost) urls.add(`${forwardedProto}://${forwardedHost}${path}`);
  urls.add(request.url.split("?")[0] ?? request.url);
  for (const base of [process.env.NEXT_PUBLIC_SITE_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    const origin = base?.trim().replace(/\/$/, "");
    if (origin) urls.add(`${origin}${path}`);
  }
  return [...urls];
}

function validTwilioSignature(token: string, signature: string, urls: string[], params: Record<string, string>) {
  const keys = Object.keys(params).sort();
  for (const url of urls) {
    const payload = keys.reduce((acc, key) => acc + key + params[key], url);
    const expected = createHmac("sha1", token).update(payload).digest("base64");
    const left = Buffer.from(expected);
    const right = Buffer.from(signature);
    if (left.length === right.length && timingSafeEqual(left, right)) return true;
  }
  return false;
}

/** Входящее сообщение WhatsApp. Ответ уходит через REST, пустой TwiML ничего дополнительно не отправляет. */
export async function POST(request: NextRequest) {
  await connection();
  const form = await request.formData().catch(() => null);
  if (!form) return new Response("Forbidden", { status: 403 });

  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") params[key] = value;
  }

  const calledNumber = canonicalWhatsappNumber(params.To ?? "");
  const twilio = await twilioAccountForNumber(calledNumber);
  if ("error" in twilio) {
    console.error("[twilio inbound] config", twilio.error);
    return new Response("Forbidden", { status: 403 });
  }
  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (!twilio.account || !signature || !validTwilioSignature(twilio.account.authToken, signature, signatureUrls(request), params)) {
    return new Response("Forbidden", { status: 403 });
  }
  const account = twilio.account;

  const digits = (params.From ?? "").replace(/^whatsapp:\+/, "").replace(/\D/g, "").slice(0, 15);
  const text = (params.Body ?? "").trim().slice(0, 4000);
  if (digits.length < 8) return received();

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("lead_sessions")
    .select("id, status, lead_data, agent_id, agents!inner(system_prompt, model, temperature, user_id)")
    .eq("agents.user_id", account.userId)
    .in("phone", [`+${digits}`, digits])
    .in("status", ["waiting_for_reply", "active_24h_window"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[twilio inbound] session", error.message);
    return received();
  }

  const agent = one(data.agents as { system_prompt: string; model: string; temperature: number } | { system_prompt: string; model: string; temperature: number }[] | null);
  if (!agent) return received();

  if (data.status === "waiting_for_reply") {
    const { error: updateError } = await supabase
      .from("lead_sessions")
      .update({ status: "active_24h_window", updated_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "waiting_for_reply");
    if (updateError) console.error("[twilio inbound] window", updateError.message);
  }
  if (!text) return received();

  const model = normalizeAgentModel(agent.model);
  const context = leadContext(data.lead_data);
  const prompt = systemPromptWithSplit(typeof agent.system_prompt === "string" ? agent.system_prompt : "", false);
  const system = context ? `${prompt}\n\n${context}` : prompt;

  after(async () => {
    try {
      const completion = await getOpenAI().chat.completions.create({
        model,
        temperature: model.includes("gpt-6") ? 1 : clampTemperature(agent.temperature),
        messages: [
          { role: "system", content: system },
          { role: "user", content: text },
        ],
      });
      const reply = stripMarkdown(completion.choices[0]?.message?.content ?? "").trim();
      if (!reply) {
        console.error("[twilio inbound] empty reply");
        return;
      }
      const sent = await sendTextMessage(account, { phoneDigits: digits, body: reply });
      if ("error" in sent) console.error("[twilio inbound] send", sent.error);
    } catch (failure) {
      console.error("[twilio inbound]", failure instanceof Error ? failure.message : failure);
    }
  });

  return received();
}
