import "server-only";

import { sendGreenMessage } from "@/lib/green-api";
import { generateOutreachMessage } from "@/lib/outreach-generate";
import { scheduleOpenBatch } from "@/lib/outreach";
import { enqueueAt } from "@/lib/outreach-queue";
import { isWithinWorkWindow, normalizeSchedule, planSendDelays, zonedDayStart, type WorkSchedule } from "@/lib/outreach-schedule";
import { OUTREACH_CHANNELS } from "@/lib/outreach-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type ProcessResult = { status: "skipped" | "success" | "error"; detail?: string; rescheduled?: boolean; followUpCampaignId?: string };

/**
 * Обрабатывает ОДНУ строку базы: парсинг сайта -> генерация -> отправка -> запись в outreach_logs.
 * Вызывается воркером очереди (/api/leads/worker). Ошибка строки не останавливает кампанию.
 * Входящие ответы клиентов идут обычным вебхуком канала в стандартную логику агента.
 */
export async function processOutreachLog(logId: string): Promise<ProcessResult> {
  const supabase = createSupabaseAdminClient();
  const markFailed = async (message: string): Promise<ProcessResult> => {
    // Только захваченная нами строка (processing) переводится в ошибку: чужие статусы не трогаем.
    await supabase
      .from("outreach_logs")
      .update({ strike_status: "error", strike_error: message })
      .eq("id", logId)
      .eq("strike_status", "queued")
      .eq("strike_error", "processing");
    return { status: "error", detail: message };
  };

  // Предохранитель: функция живёт максимум 120 с, поэтому на 100-й секунде фиксируем ошибку, а не оставляем «В очереди».
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<ProcessResult>((resolve) => {
    timer = setTimeout(() => void markFailed("Превышено время обработки (100 с): сайт или модель не ответили").then(resolve), 100_000);
  });
  try {
    const result = await Promise.race([runOutreachLog(logId), deadline]);
    if (result.followUpCampaignId) {
      const followUp = await scheduleOpenBatch(result.followUpCampaignId);
      if (followUp.error) console.error(`[outreach-worker] не удалось поставить следующую пачку: ${followUp.error}`);
    }
    return result;
  } catch (error) {
    return markFailed(`Внутренняя ошибка: ${error instanceof Error ? error.message : "неизвестная"}`);
  } finally {
    clearTimeout(timer);
  }
}

async function runOutreachLog(logId: string): Promise<ProcessResult> {
  const supabase = createSupabaseAdminClient();
  const { data: log } = await supabase
    .from("outreach_logs")
    .select("id, campaign_id, row_index, contact_data, strike_status")
    .eq("id", logId)
    .maybeSingle();
  if (!log || log.strike_status !== "queued") return { status: "skipped", detail: "строка уже обработана или удалена" };

  // Атомарный захват строки: повторная доставка QStash или повторный запуск после паузы не отправят дубль.
  const claim = (marker: "scheduled" | null) => {
    const query = supabase.from("outreach_logs").update({ strike_error: "processing" }).eq("id", logId).eq("strike_status", "queued");
    return (marker ? query.eq("strike_error", marker) : query.is("strike_error", null)).select("id");
  };
  let { data: claimed } = await claim("scheduled");
  if (!claimed?.length) ({ data: claimed } = await claim(null));
  if (!claimed?.length) return { status: "skipped", detail: "строка уже в обработке" };
  const release = () => supabase.from("outreach_logs").update({ strike_error: null }).eq("id", logId);

  const scheduleSelect =
    "id, user_id, agent_id, channel_type, outreach_prompt, daily_limit, status, contact_column, website_column, name_column, social_column, message_type, fixed_message, fallback_message, language, webhook_url, min_delay_minutes, max_delay_minutes, delay_mode, fixed_delay_minutes, work_time_start, work_time_end, timezone";
  let campaignResult = await supabase.from("outreach_campaigns").select(scheduleSelect).eq("id", log.campaign_id).maybeSingle();
  if (campaignResult.error && /work_time_start|work_time_end|timezone/.test(campaignResult.error.message)) {
    campaignResult = await supabase
      .from("outreach_campaigns")
      .select(
        "id, user_id, agent_id, channel_type, outreach_prompt, daily_limit, status, contact_column, website_column, name_column, social_column, message_type, fixed_message, fallback_message, language, webhook_url, min_delay_minutes, max_delay_minutes, delay_mode, fixed_delay_minutes",
      )
      .eq("id", log.campaign_id)
      .maybeSingle();
  }
  const campaign = campaignResult.data;
  if (!campaign || campaign.status !== "active") {
    await release();
    return { status: "skipped", detail: `кампания не активна (${campaign?.status ?? "не найдена"})` };
  }

  const fail = async (message: string): Promise<ProcessResult> => {
    await supabase.from("outreach_logs").update({ strike_status: "error", strike_error: message }).eq("id", logId);
    await notifyWebhook(campaign.webhook_url, { status: "error", error: message, contact: log.contact_data });
    return { status: "error", detail: message };
  };

  const schedule = normalizeSchedule({
    workTimeStart: campaign.work_time_start,
    workTimeEnd: campaign.work_time_end,
    timezone: campaign.timezone,
  });
  const now = new Date();
  const { count } = await supabase
    .from("outreach_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("strike_status", "success")
    .gte("strike_sent_time", zonedDayStart(now, schedule.timezone).toISOString());
  const limitReached = (count ?? 0) >= Number(campaign.daily_limit);
  // Сначала переводим текущий момент в пояс кампании, потом сравниваем с окном.
  const outside = !isWithinWorkWindow(now, schedule);
  if (limitReached || outside) {
    const deferred = await deferUntilWindow(logId, Number(log.row_index ?? 0), campaign, schedule, limitReached, count ?? 0);
    if (!deferred.ok) {
      await release();
      return { status: "skipped", detail: limitReached ? "daily_limit" : "outside_hours" };
    }
    return { status: "skipped", detail: limitReached ? "daily_limit" : "outside_hours", rescheduled: true };
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, system_prompt, model, wa_instance_id, wa_api_token")
    .eq("id", campaign.agent_id)
    .eq("user_id", campaign.user_id)
    .maybeSingle();
  if (!agent) return fail("Агент кампании не найден");

  const contact = Object.fromEntries(
    Object.entries((log.contact_data ?? {}) as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]),
  );
  const channel = campaign.channel_type as string;
  const channelLabel = OUTREACH_CHANNELS.find((item) => item.value === channel)?.label ?? channel;

  const generated = await generateOutreachMessage({
    outreachPrompt: String(campaign.outreach_prompt ?? ""),
    agentName: String(agent.name),
    agentPrompt: String(agent.system_prompt ?? ""),
    channelLabel,
    contact,
    messageType: campaign.message_type === "fixed" ? "fixed" : "ai",
    fixedMessage: String(campaign.fixed_message ?? ""),
    fallbackMessage: String(campaign.fallback_message ?? ""),
    language: String(campaign.language ?? "Русский"),
    mapping: {
      contact: campaign.contact_column,
      website: campaign.website_column,
      name: campaign.name_column,
      social: campaign.social_column,
    },
    model: agent.model,
  });
  if (!generated.ok) return fail(generated.error);

  const target = campaign.contact_column ? (contact[campaign.contact_column] ?? "") : "";
  if (channel !== "whatsapp") return fail(`Отправка через ${channelLabel} пока не подключена к кампаниям`);
  const digits = target.replace(/\D/g, "");
  if (digits.length < 8) return fail("Некорректный номер телефона");
  if (!agent.wa_instance_id || !agent.wa_api_token) return fail("У агента не подключён WhatsApp");

  try {
    await sendGreenMessage(`${digits}@c.us`, generated.message, {
      idInstance: String(agent.wa_instance_id),
      apiToken: String(agent.wa_api_token),
    });
  } catch (error) {
    return fail(`Ошибка отправки: ${error instanceof Error ? error.message : "неизвестная"}`);
  }

  const sentAt = new Date().toISOString();
  await supabase
    .from("outreach_logs")
    .update({ strike_status: "success", strike_sent_time: sentAt, strike_message: generated.message, strike_error: null })
    .eq("id", logId);
  await notifyWebhook(campaign.webhook_url, { status: "success", sent_at: sentAt, message: generated.message, contact });

  const [scheduledLeft, waiting, processing] = await Promise.all([
    countQueued(campaign.id, "scheduled"),
    countQueued(campaign.id, null),
    countQueued(campaign.id, "processing"),
  ]);
  if (scheduledLeft === 0 && waiting === 0 && processing === 0) {
    await supabase.from("outreach_campaigns").update({ status: "completed" }).eq("id", campaign.id);
  }
  return { status: "success", followUpCampaignId: scheduledLeft === 0 && waiting > 0 ? campaign.id : undefined };
}

async function countQueued(campaignId: string, marker: "scheduled" | "processing" | null) {
  const query = createSupabaseAdminClient()
    .from("outreach_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("strike_status", "queued");
  const { count, error } = await (marker ? query.eq("strike_error", marker) : query.is("strike_error", null));
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function deferUntilWindow(
  logId: string,
  rowIndex: number,
  campaign: {
    id: string;
    daily_limit: number;
    delay_mode: string | null;
    min_delay_minutes: number | null;
    max_delay_minutes: number | null;
    fixed_delay_minutes: number | null;
  },
  schedule: WorkSchedule,
  limitReached: boolean,
  sentToday: number,
) {
  const supabase = createSupabaseAdminClient();
  const { count: ahead } = await supabase
    .from("outreach_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("strike_status", "queued")
    .lt("row_index", rowIndex);
  const delays = planSendDelays({
    count: Math.min(1000, (ahead ?? 0) + 1),
    sentToday: limitReached ? Number(campaign.daily_limit) : sentToday,
    dailyLimit: Number(campaign.daily_limit),
    delay: {
      mode: campaign.delay_mode === "fixed" ? "fixed" : "random",
      minMinutes: Number(campaign.min_delay_minutes ?? 3),
      maxMinutes: Number(campaign.max_delay_minutes ?? 8),
      fixedMinutes: Number(campaign.fixed_delay_minutes ?? 5),
    },
    schedule,
    random: () => 0,
  });
  const delaySeconds = delays.length > 0 ? delays[delays.length - 1] : 24 * 60 * 60;
  const published = await enqueueAt([{ logId, delaySeconds: Math.max(30, delaySeconds) }]);
  if (published.queued === 0) return { ok: false as const, error: published.error };
  const { error } = await supabase.from("outreach_logs").update({ strike_error: "scheduled" }).eq("id", logId).eq("strike_error", "processing");
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

async function notifyWebhook(url: unknown, payload: Record<string, unknown>) {
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Вебхук клиента не должен ломать рассылку.
  }
}
