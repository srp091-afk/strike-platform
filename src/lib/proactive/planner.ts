import "server-only";

import { normalizeAgentModel } from "@/lib/agent-models";
import { sourceAdapter } from "@/lib/proactive/connectors";
import { withDeal } from "@/lib/proactive/connectors/pipedrive";
import type { PostAction, SourceEntity } from "@/lib/proactive/connectors/types";
import type { ProactiveChannel } from "@/lib/proactive/delivery";
import { scheduleTasks } from "@/lib/proactive/scheduler";
import { getOpenAI } from "@/lib/openai";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const RUN_CAP = 12;

type Plan = {
  should_contact: boolean;
  ai_reasoning: string;
  draft_subject: string;
  draft_message: string;
  post_action: PostAction;
};

export type PlanResult = { ok: true; created: number; skipped: number; notice: string | null } | { ok: false; error: string };

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    should_contact: { type: "boolean" },
    ai_reasoning: { type: "string" },
    draft_subject: { type: "string" },
    draft_message: { type: "string" },
    add_note: { type: "boolean" },
    move_stage_id: { type: "string" },
  },
  required: ["should_contact", "ai_reasoning", "draft_subject", "draft_message", "add_note", "move_stage_id"],
} as const;

export async function planCampaign(userId: string, campaignId: string): Promise<PlanResult> {
  const admin = createSupabaseAdminClient();
  const campaign = await admin
    .from("proactive_campaigns")
    .select("id, user_id, agent_id, source_id, channel, goal_prompt, require_approval, status")
    .eq("id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();
  if (campaign.error) return { ok: false, error: missingTable(campaign.error.message) };
  if (!campaign.data) return { ok: false, error: "Кампания не найдена." };

  const [agent, source, seen] = await Promise.all([
    admin.from("agents").select("id, name, system_prompt, model").eq("id", campaign.data.agent_id).eq("user_id", userId).maybeSingle(),
    admin.from("proactive_sources").select("id, type, config").eq("id", campaign.data.source_id).eq("user_id", userId).maybeSingle(),
    admin.from("agent_action_queue").select("external_entity_id, status").eq("campaign_id", campaignId).eq("user_id", userId),
  ]);
  if (agent.error || source.error || seen.error) {
    return { ok: false, error: missingTable(agent.error?.message || source.error?.message || seen.error?.message || "") };
  }
  if (!agent.data || !source.data) return { ok: false, error: "Агент или источник не найден." };
  const adapter = sourceAdapter(String(source.data.type));
  if (!adapter) return { ok: false, error: "Источник не поддерживается." };

  let entities: SourceEntity[] = [];
  try {
    entities = await adapter.fetchEntities(asConfig(source.data.config));
  } catch (error) {
    await admin.from("proactive_sources").update({ status: "error" }).eq("id", source.data.id).eq("user_id", userId);
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось прочитать источник." };
  }
  await admin
    .from("proactive_sources")
    .update({ status: "active", last_synced_at: new Date().toISOString() })
    .eq("id", source.data.id)
    .eq("user_id", userId);

  const blocked = new Set(
    (seen.data ?? []).filter((row) => row.status !== "rejected").map((row) => String(row.external_entity_id)),
  );
  const channel = campaign.data.channel as ProactiveChannel;
  const fresh = entities.filter((entity) => !blocked.has(entity.externalId) && targetOf(entity, channel));
  const wallet = await readCredits(admin, userId);
  if (wallet < 1) return { ok: false, error: "Закончились STRIKE Credits. Пополните баланс, чтобы собрать план." };

  let created = 0;
  let skipped = 0;
  let notice: string | null = null;
  const createdIds: string[] = [];
  for (const entity of fresh.slice(0, RUN_CAP)) {
    if ((await readCredits(admin, userId)) < 1) {
      notice = "Генерация остановлена: на счёте 0 SC.";
      break;
    }
    const target = targetOf(entity, channel);
    if (!target) {
      skipped += 1;
      continue;
    }
    let plan: Plan;
    try {
      plan = await draftPlan({
        model: agent.data.model,
        agentName: String(agent.data.name ?? "Агент"),
        role: String(agent.data.system_prompt ?? ""),
        goal: String(campaign.data.goal_prompt ?? ""),
        channel,
        entity,
      });
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "Модель не ответила." };
    }
    if (!plan.should_contact || !plan.draft_message.trim()) {
      skipped += 1;
      continue;
    }
    const postAction = withDeal(
      { add_note: plan.post_action.add_note, move_stage_id: plan.post_action.move_stage_id, note: plan.ai_reasoning },
      entity.payload,
    );
    const inserted = await admin
      .from("agent_action_queue")
      .insert({
        user_id: userId,
        campaign_id: campaignId,
        agent_id: agent.data.id,
        source_id: source.data.id,
        external_entity_id: entity.externalId,
        contact_name: entity.name.slice(0, 160),
        contact_target: target.slice(0, 200),
        channel,
        ai_reasoning: plan.ai_reasoning.slice(0, 280),
        context_payload: entity.payload,
        draft_subject: channel === "email" ? plan.draft_subject.slice(0, 160) : null,
        draft_message: plan.draft_message.slice(0, 2000),
        post_action: postAction,
        status: "pending_approval",
      })
      .select("id")
      .maybeSingle();
    if (inserted.error) {
      if (/duplicate|unique/i.test(inserted.error.message)) {
        skipped += 1;
        continue;
      }
      return { ok: false, error: inserted.error.message };
    }
    const spent = await spendOne(admin, userId, `proactive_plan_${inserted.data?.id}`, "План проактивного сообщения · 1 SC");
    if (spent < 0) {
      if (inserted.data?.id) await admin.from("agent_action_queue").delete().eq("id", inserted.data.id).eq("user_id", userId);
      notice = "Генерация остановлена: на счёте 0 SC.";
      break;
    }
    if (inserted.data?.id) createdIds.push(String(inserted.data.id));
    created += 1;
  }

  if (campaign.data.status === "draft") {
    await admin.from("proactive_campaigns").update({ status: "active" }).eq("id", campaignId).eq("user_id", userId);
  }
  if (!campaign.data.require_approval && createdIds.length > 0) {
    await scheduleTasks(userId, createdIds);
  }
  const left = Math.max(0, fresh.length - created - skipped);
  if (!notice && left > 0) notice = `За один запуск берём ${RUN_CAP} контактов. Осталось ещё ${left}: запустите сбор снова.`;
  return { ok: true, created, skipped, notice };
}

async function draftPlan(input: {
  model: unknown;
  agentName: string;
  role: string;
  goal: string;
  channel: ProactiveChannel;
  entity: SourceEntity;
}): Promise<Plan> {
  const model = normalizeAgentModel(input.model);
  const messages = [
    {
      role: "system" as const,
      content: [
        `Ты — ИИ-агент «${input.agentName}». Роль агента:`,
        input.role.trim() || "Помогаешь клиенту коротко и по делу.",
        "",
        `Задача кампании: ${input.goal.trim() || "Написать первое полезное сообщение."}`,
        `Канал: ${input.channel}.`,
        "Реши, стоит ли писать этому контакту. Если данных мало или контакт не подходит под задачу, should_contact = false.",
        "draft_message — готовый текст без markdown, до 700 знаков. Для email заполни draft_subject. ai_reasoning — одна короткая строка, почему такой заход.",
        "Ответ — только JSON. Пиши на языке контакта. Если язык неясен — по-русски.",
      ].join("\n"),
    },
    { role: "user" as const, content: input.entity.context.slice(0, 3000) || input.entity.name },
  ];
  let completion;
  try {
    completion = await getOpenAI().chat.completions.create({
      model,
      temperature: model.includes("gpt-6") ? 1 : 0.4,
      messages,
      response_format: { type: "json_schema", json_schema: { name: "proactive_plan", strict: true, schema: PLAN_SCHEMA } },
    });
  } catch {
    completion = await getOpenAI().chat.completions.create({
      model,
      temperature: model.includes("gpt-6") ? 1 : 0.4,
      messages,
      response_format: { type: "json_object" },
    });
  }
  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("Модель вернула не JSON.");
  }
  return {
    should_contact: parsed.should_contact === true,
    ai_reasoning: String(parsed.ai_reasoning ?? "").trim(),
    draft_subject: String(parsed.draft_subject ?? "").trim(),
    draft_message: String(parsed.draft_message ?? "").trim(),
    post_action: { add_note: parsed.add_note !== false, move_stage_id: String(parsed.move_stage_id ?? "").trim() },
  };
}

function targetOf(entity: SourceEntity, channel: ProactiveChannel) {
  if (channel === "email") return entity.email.includes("@") ? entity.email : "";
  if (channel === "telegram") return entity.telegram || entity.phone;
  return entity.phone.replace(/\D/g, "");
}

function asConfig(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function readCredits(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const row = await admin.from("profiles").select("strike_credits").eq("id", userId).maybeSingle();
  const credits = Number(row.data?.strike_credits ?? 0);
  return Number.isFinite(credits) ? credits : 0;
}

async function spendOne(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string, orderId: string, description: string) {
  const { data, error } = await admin.rpc("spend_strike_credits", {
    p_user_id: userId,
    p_credits: 1,
    p_order_id: orderId,
    p_description: description,
  });
  if (error) return -1;
  const remaining = Number(data);
  return Number.isFinite(remaining) ? remaining : -1;
}

function missingTable(message: string) {
  return /proactive_|agent_action_queue/.test(message) ? "Примените миграцию 20261126_proactive_core.sql." : message;
}

export async function planDueCampaigns() {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("proactive_campaigns")
    .select("id, user_id, schedule_cron")
    .eq("status", "active")
    .not("schedule_cron", "is", null)
    .limit(20);
  if (error || !data) return;
  const now = new Date();
  for (const campaign of data) {
    const { cronMatches } = await import("@/lib/proactive/delivery");
    if (!cronMatches(typeof campaign.schedule_cron === "string" ? campaign.schedule_cron : null, now)) continue;
    await planCampaign(String(campaign.user_id), String(campaign.id)).catch((planError) => {
      console.error("[proactive plan]", planError instanceof Error ? planError.message : planError);
    });
  }
}
