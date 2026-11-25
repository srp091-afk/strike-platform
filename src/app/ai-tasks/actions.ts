"use server";

import { revalidatePath } from "next/cache";

import { getEffectiveUserId } from "@/lib/account-context";
import { parseCsv } from "@/lib/proactive/connectors/csv";
import { sourceAdapter, type SourceType } from "@/lib/proactive/connectors";
import { defaultDelivery, readDelivery, type DeliveryConfig, type ProactiveChannel } from "@/lib/proactive/delivery";
import { executeDueProactive } from "@/lib/proactive/execute";
import { planCampaign } from "@/lib/proactive/planner";
import { rescheduleCampaign, scheduleTasks } from "@/lib/proactive/scheduler";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type ActionResult = { ok: boolean; error: string | null; notice: string | null };

const empty: ActionResult = { ok: false, error: null, notice: null };

function done(notice: string): ActionResult {
  revalidatePath("/ai-tasks");
  revalidatePath("/", "layout");
  return { ok: true, error: null, notice };
}

function fail(error: string): ActionResult {
  return { ...empty, error: migrationHint(error) };
}

function migrationHint(message: string) {
  return /proactive_|agent_action_queue|claim_proactive_actions|contact_key|followup_conflict/.test(message)
    ? "Примените миграции 20261126_proactive_core.sql и 20261127_proactive_dialogs.sql."
    : message;
}

export async function createSource(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const type = String(formData.get("type") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!isSourceType(type)) return fail("Выберите тип источника.");
  const kind = type;
  if (!name || name.length > 120) return fail("Укажите название до 120 символов.");
  const built = await sourceConfig(kind, formData);
  if (!built.ok) return fail(built.error);
  const adapter = sourceAdapter(kind);
  if (!adapter) return fail("Источник не поддерживается.");
  try {
    const userId = await getEffectiveUserId();
    const tested = await adapter.testConnection({ ...built.config, userId });
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("proactive_sources").insert({
      user_id: userId,
      name,
      type: kind,
      config: built.config,
      status: tested.ok ? "active" : "error",
      last_synced_at: tested.ok ? new Date().toISOString() : null,
    });
    if (error) return fail(error.message);
    return done(tested.ok ? tested.detail : `Источник сохранён. ${tested.error}`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Не удалось сохранить источник.");
  }
}

function isSourceType(value: string): value is SourceType {
  return value === "csv" || value === "google_sheets" || value === "pipedrive" || value === "strike_chats" || value === "amocrm";
}

async function sourceConfig(type: SourceType, formData: FormData): Promise<{ ok: true; config: Record<string, unknown> } | { ok: false; error: string }> {
  if (type === "csv") {
    const file = formData.get("file");
    const text = file instanceof File ? await file.text() : "";
    if (!text.trim()) return { ok: false, error: "Загрузите CSV." };
    if (text.length > 400_000) return { ok: false, error: "CSV больше 400 КБ." };
    const parsed = parseCsv(text);
    if (parsed.records.length === 0) return { ok: false, error: "В CSV нет строк." };
    return { ok: true, config: { columns: parsed.columns, rows: parsed.records } };
  }
  if (type === "google_sheets") {
    const url = String(formData.get("url") ?? "").trim();
    if (!url.includes("docs.google.com/spreadsheets")) return { ok: false, error: "Нужна ссылка на Google Таблицу." };
    return { ok: true, config: { url } };
  }
  if (type === "strike_chats" || type === "amocrm") {
    const agentId = String(formData.get("agent_id") ?? "").trim();
    if (!agentId) return { ok: false, error: "Выберите агента." };
    if (type === "amocrm") return { ok: true, config: { agentId } };
    return {
      ok: true,
      config: {
        agentId,
        channels: ["whatsapp", "telegram", "instagram"],
        min_silence_hours: 4,
        max_silence_days: 14,
        cooldown_hours: 24,
      },
    };
  }
  const apiToken = String(formData.get("api_token") ?? "").trim();
  if (!apiToken) return { ok: false, error: "Укажите API-токен Pipedrive." };
  const mode = String(formData.get("mode") ?? "open");
  return { ok: true, config: { apiToken, mode: mode === "stale" || mode === "overdue" ? mode : "open", staleDays: 14 } };
}

export async function saveCampaign(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const agentId = String(formData.get("agent_id") ?? "");
  const sourceId = String(formData.get("source_id") ?? "");
  const channel = String(formData.get("channel") ?? "") as ProactiveChannel;
  const goal = String(formData.get("goal_prompt") ?? "").trim();
  const cron = String(formData.get("schedule_cron") ?? "").trim();
  if (!name) return fail("Укажите название кампании.");
  if (channel !== "whatsapp" && channel !== "telegram" && channel !== "email") return fail("Выберите канал.");
  if (!goal) return fail("Опишите задачу для агента.");
  const delivery = deliveryFromForm(formData, channel);
  try {
    const userId = await getEffectiveUserId();
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("proactive_campaigns").insert({
      user_id: userId,
      agent_id: agentId,
      source_id: sourceId,
      name: name.slice(0, 120),
      channel,
      goal_prompt: goal.slice(0, 2000),
      require_approval: formData.get("require_approval") === "on",
      schedule_cron: cron || null,
      delivery_config: delivery,
      followup_conflict_mode: formData.get("followup_conflict_mode") === "override_builtin" ? "override_builtin" : "wait_builtin",
      status: "draft",
    });
    if (error) return fail(error.message);
    return done("Кампания создана.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Не удалось создать кампанию.");
  }
}

export async function createMessengerWatch(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const agentId = String(formData.get("agent_id") ?? "").trim();
  if (!agentId) return fail("Выберите агента.");
  try {
    const userId = await getEffectiveUserId();
    const admin = createSupabaseAdminClient();
    const source = await admin
      .from("proactive_sources")
      .insert({
        user_id: userId,
        name: "Мониторинг чатов",
        type: "strike_chats",
        config: {
          agentId,
          channels: ["whatsapp", "telegram", "instagram"],
          min_silence_hours: 4,
          max_silence_days: 14,
          cooldown_hours: 24,
        },
        status: "active",
      })
      .select("id")
      .maybeSingle();
    if (source.error || !source.data) return fail(source.error?.message || "Не удалось создать источник.");
    const campaign = await admin.from("proactive_campaigns").insert({
      user_id: userId,
      agent_id: agentId,
      source_id: source.data.id,
      name: "Мониторинг активных чатов",
      channel: "whatsapp",
      goal_prompt: "Следи за затихшими диалогами. Если клиент ждёт КП или оставил контакт — подготовь точный следующий шаг. Закрытые и отказные разговоры не пиши.",
      require_approval: true,
      followup_conflict_mode: "wait_builtin",
      delivery_config: defaultDelivery("whatsapp"),
      status: "draft",
    });
    if (campaign.error) return fail(campaign.error.message);
    return done("Кампания мониторинга чатов создана. Запустите сбор, когда будете готовы.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Не удалось создать мониторинг.");
  }
}

export async function updateDelivery(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const campaignId = String(formData.get("campaign_id") ?? "");
  const channel = String(formData.get("channel") ?? "whatsapp") as ProactiveChannel;
  const delivery = deliveryFromForm(formData, channel === "email" || channel === "telegram" ? channel : "whatsapp");
  try {
    const userId = await getEffectiveUserId();
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("proactive_campaigns").update({ delivery_config: delivery }).eq("id", campaignId).eq("user_id", userId);
    if (error) return fail(error.message);
    const moved = await rescheduleCampaign(userId, campaignId);
    if (!moved.ok) return fail(moved.error);
    return done("Интервалы сохранены, очередь пересчитана.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Не удалось сохранить интервалы.");
  }
}

function deliveryFromForm(formData: FormData, channel: ProactiveChannel): DeliveryConfig {
  const base = defaultDelivery(channel);
  return readDelivery(
    {
      mode: String(formData.get("mode") ?? base.mode),
      min_delay_sec: Number(formData.get("min_delay_sec")),
      max_delay_sec: Number(formData.get("max_delay_sec")),
      batch_size: Number(formData.get("batch_size")),
      batch_delay_sec: Number(formData.get("batch_delay_sec")),
      daily_limit: Number(formData.get("daily_limit")),
      work_hours_only: formData.get("work_hours_only") === "on",
      work_hours_start: String(formData.get("work_hours_start") ?? base.work_hours_start),
      work_hours_end: String(formData.get("work_hours_end") ?? base.work_hours_end),
    },
    channel,
  );
}

export async function launchCampaign(campaignId: string): Promise<ActionResult> {
  try {
    const result = await planCampaign(await getEffectiveUserId(), campaignId);
    if (!result.ok) return fail(result.error);
    revalidatePath("/ai-tasks");
    revalidatePath("/", "layout");
    return { ok: true, error: null, notice: result.notice || `Готово карточек: ${result.created}. Пропущено: ${result.skipped}.` };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Не удалось запустить сбор.");
  }
}

export async function approveTasks(ids: string[]): Promise<ActionResult> {
  try {
    const userId = await getEffectiveUserId();
    const result = await scheduleTasks(userId, ids);
    if (!result.ok) return fail(result.error);
    return done(`В очереди: ${result.scheduled}.`);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Не удалось одобрить.");
  }
}

export async function rejectTask(id: string): Promise<ActionResult> {
  try {
    const userId = await getEffectiveUserId();
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("agent_action_queue").update({ status: "rejected" }).eq("id", id).eq("user_id", userId).eq("status", "pending_approval");
    if (error) return fail(error.message);
    return done("Карточка отклонена.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Не удалось отклонить.");
  }
}

export async function saveDraft(id: string, message: string, subject: string): Promise<ActionResult> {
  const text = message.trim();
  if (!text) return fail("Текст не может быть пустым.");
  try {
    const userId = await getEffectiveUserId();
    const admin = createSupabaseAdminClient();
    const { error } = await admin
      .from("agent_action_queue")
      .update({ draft_message: text.slice(0, 2000), draft_subject: subject.trim().slice(0, 160) || null })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "pending_approval");
    if (error) return fail(error.message);
    return done("Текст сохранён.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Не удалось сохранить текст.");
  }
}

export async function setCampaignStatus(campaignId: string, status: "active" | "paused"): Promise<ActionResult> {
  try {
    const userId = await getEffectiveUserId();
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("proactive_campaigns").update({ status }).eq("id", campaignId).eq("user_id", userId);
    if (error) return fail(error.message);
    if (status === "active") await rescheduleCampaign(userId, campaignId);
    return done(status === "paused" ? "Кампания на паузе. Новые отправки не уйдут." : "Кампания снова в работе, очередь пересчитана.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Не удалось сменить статус.");
  }
}

export async function retryTask(id: string): Promise<ActionResult> {
  try {
    const result = await scheduleTasks(await getEffectiveUserId(), [id]);
    if (!result.ok) return fail(result.error);
    return done("Задача снова в очереди.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Не удалось повторить.");
  }
}

export async function runDueNow(): Promise<ActionResult> {
  try {
    const summary = await executeDueProactive({ userId: await getEffectiveUserId(), plan: false });
    if (!summary.ok) return fail(summary.error ?? "Не удалось отправить.");
    revalidatePath("/ai-tasks");
    revalidatePath("/chats");
    return { ok: true, error: null, notice: `Отправлено: ${summary.sent}. Ошибок: ${summary.failed}.` };
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Не удалось проверить очередь.");
  }
}
