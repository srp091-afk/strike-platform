import { createHash } from "node:crypto";

import { connection } from "next/server";

import { computeQuizResult, type QuizAnswerInput } from "@/lib/sites/quiz-calculator";
import { parseQuizSchema } from "@/lib/sites/quiz-schema";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const MESSENGERS = new Set(["whatsapp", "telegram", "phone", "email"]);

export async function POST(request: Request) {
  await connection();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const siteId = typeof body?.siteId === "string" ? body.siteId : "";
  const name = text(body?.name).slice(0, 120);
  const phone = text(body?.phone).slice(0, 32);
  const email = text(body?.email).slice(0, 160);
  const messenger = MESSENGERS.has(text(body?.messenger)) ? text(body?.messenger) : null;
  const answers = Array.isArray(body?.answers) ? body.answers.slice(0, 20) : [];
  if (!siteId) return Response.json({ error: "Сайт не найден." }, { status: 400 });
  if (!name && !phone && !email) return Response.json({ error: "Оставьте контакт." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const site = await admin.from("landings").select("id, user_id, title, site_type, agent_id, analytics_config, status, published_schema").eq("id", siteId).maybeSingle();
  if (site.error || !site.data || site.data.status !== "published") {
    return Response.json({ error: "Сайт не принимает заявки." }, { status: 404 });
  }
  const ownerId = String(site.data.user_id ?? "");
  const schema = parseQuizSchema(site.data.published_schema);
  const calculated = schema.resultPreview.enabled ? computeQuizResult(schema, answerMap(schema, answers)) : null;
  const payload = {
    site_id: siteId,
    user_id: ownerId,
    site_type: String(site.data.site_type ?? "quiz"),
    contact_name: name || null,
    contact_phone: phone || null,
    contact_email: email || null,
    preferred_messenger: messenger,
    answers,
    utm_params: object(body?.utm),
    meta: {
      referrer: text(body?.referrer).slice(0, 300),
      userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? "",
      device: text(body?.device).slice(0, 20),
      ipHash: hashIp(request.headers.get("x-forwarded-for") ?? ""),
    },
  };
  let inserted = await admin.from("site_submissions").insert({ ...payload, calculated_result: calculated });
  if (inserted.error && /calculated_result/i.test(inserted.error.message)) {
    inserted = await admin.from("site_submissions").insert(payload);
  }
  if (inserted.error) return Response.json({ error: "Не удалось сохранить заявку." }, { status: 500 });

  await admin.from("landings").update({ leads_count: Number(await countLeads(admin, siteId)) }).eq("id", siteId);
  await admin.from("site_events").insert({ site_id: siteId, event_type: "lead_submit", session_id: text(body?.sessionId).slice(0, 80) });

  const analytics = object(site.data.analytics_config);
  const sync = analytics.syncLeads !== false;
  const agentId = typeof site.data.agent_id === "string" ? site.data.agent_id : "";
  if (sync && agentId && phone) {
    const answerSummary = answers
      .map((item) => {
        const row = object(item);
        return `${text(row.question)}: ${text(row.answer)}`;
      })
      .filter((line) => line !== ": ")
      .join("\n");
    const summary = calculated?.plainTextSummary ? `${answerSummary}\n\nРасчёт квиза:\n${calculated.plainTextSummary}` : answerSummary;
    await admin.from("lead_sessions").insert({
      agent_id: agentId,
      phone: phone.replace(/[^\d+]/g, "").slice(0, 20),
      lead_data: {
        source: `Квиз: ${String(site.data.title ?? "Сайт")}`,
        name,
        email,
        messenger,
        summary,
        result: calculated,
      },
      status: "pending",
    });
  }
  return Response.json({ ok: true });
}

async function countLeads(admin: ReturnType<typeof createSupabaseAdminClient>, siteId: string) {
  const { count } = await admin.from("site_submissions").select("id", { count: "exact", head: true }).eq("site_id", siteId);
  return count ?? 0;
}

function hashIp(value: string) {
  const ip = value.split(",")[0]?.trim() ?? "";
  if (!ip) return "";
  return createHash("sha256").update(`${ip}|strike-sites`).digest("hex").slice(0, 32);
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function answerMap(schema: ReturnType<typeof parseQuizSchema>, answers: unknown[]) {
  const map: Record<string, QuizAnswerInput> = {};
  for (const item of answers) {
    const row = object(item);
    const stepId = text(row.stepId);
    const step = schema.steps.find((entry) => entry.id === stepId) ?? schema.steps.find((entry) => entry.title === text(row.question));
    if (!step) continue;
    const optionIds = Array.isArray(row.optionIds) ? row.optionIds.filter((id): id is string => typeof id === "string") : [];
    const label = text(row.answer);
    const matched = optionIds.length > 0 ? optionIds : step.options.filter((option) => label.split(", ").includes(option.label)).map((option) => option.id);
    const numeric = Number(row.value);
    map[step.id] = { optionIds: matched, text: label, value: Number.isFinite(numeric) ? numeric : undefined };
  }
  return map;
}
