"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getCampaign, listAgentOptions } from "@/lib/outreach";
import { enqueueLogs, outreachQueueConfigured } from "@/lib/outreach-queue";
import {
  OUTREACH_MAX_ROWS,
  readOutreachChannel,
  type OutreachChannel,
  type OutreachDelayMode,
  type OutreachMessageType,
} from "@/lib/outreach-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

const DEFAULT_NAME = "Новая рассылка";

/** «Новая рассылка», «Новая рассылка (1)», «Новая рассылка (2)»…: первое свободное имя среди кампаний пользователя. */
async function nextDraftName(userId: string) {
  const { data } = await createSupabaseAdminClient()
    .from("outreach_campaigns")
    .select("name")
    .eq("user_id", userId)
    .ilike("name", `${DEFAULT_NAME}%`);
  const taken = new Set((data ?? []).map((row) => String(row.name).trim().toLowerCase()));
  if (!taken.has(DEFAULT_NAME.toLowerCase())) return DEFAULT_NAME;
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${DEFAULT_NAME} (${index})`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${DEFAULT_NAME} (${Date.now()})`;
}

/** «+ Новая рассылка»: создаёт черновик в БД и переводит на рабочую область кампании. */
export async function createCampaignDraft() {
  const userId = await getAuthenticatedUserId();
  const { data, error } = await createSupabaseAdminClient()
    .from("outreach_campaigns")
    .insert({ user_id: userId, name: await nextDraftName(userId), status: "draft" })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(error?.message.includes("outreach_campaigns") ? "Примените миграцию 20261104_outreach.sql." : (error?.message ?? "Не удалось создать рассылку."));
  }
  revalidatePath("/outreach");
  redirect(`/outreach/${data.id}`);
}

export type CampaignSettingsInput = {
  name: string;
  agent_id: string | null;
  channel_type: OutreachChannel | null;
  outreach_prompt: string;
  min_delay_minutes: number;
  max_delay_minutes: number;
  daily_limit: number;
  contact_column: string | null;
  website_column: string | null;
  name_column: string | null;
  social_column: string | null;
  message_type: OutreachMessageType;
  fixed_message: string;
  delay_mode: OutreachDelayMode;
  fixed_delay_minutes: number;
  webhook_url: string | null;
};

export async function saveCampaignSettings(id: string, input: CampaignSettingsInput): Promise<Result> {
  const userId = await getAuthenticatedUserId();
  const campaign = await getCampaign(userId, id);
  if (!campaign) return fail("Рассылка не найдена.");
  if (campaign.status === "active") return fail("Поставьте рассылку на паузу, чтобы изменить настройки.");

  const name = input.name.trim().slice(0, 120) || DEFAULT_NAME;
  const min = Math.max(0, Math.min(1440, Math.round(Number(input.min_delay_minutes) || 0)));
  const max = Math.max(min, Math.min(1440, Math.round(Number(input.max_delay_minutes) || 0)));
  const fixedDelay = Math.max(0, Math.min(1440, Math.round(Number(input.fixed_delay_minutes) || 0)));
  const delayMode: OutreachDelayMode = input.delay_mode === "fixed" ? "fixed" : "random";
  const messageType: OutreachMessageType = input.message_type === "fixed" ? "fixed" : "ai";
  const daily = Math.max(1, Math.min(5000, Math.round(Number(input.daily_limit) || 1)));

  const channel = readOutreachChannel(input.channel_type);
  if (input.agent_id) {
    const agent = (await listAgentOptions()).find((item) => item.id === input.agent_id);
    if (!agent) return fail("Агент не найден.");
    if (channel && !agent.channels.includes(channel)) {
      return fail("Этот канал не подключён или выключен у выбранного агента.");
    }
  }

  const webhook = input.webhook_url?.trim() || null;
  if (webhook && !/^https:\/\/\S+$/i.test(webhook)) return fail("Вебхук должен начинаться с https://");

  const columns = campaign.source_columns;
  const contactColumn = input.contact_column && columns.includes(input.contact_column) ? input.contact_column : null;
  const websiteColumn = input.website_column && columns.includes(input.website_column) ? input.website_column : null;
  const nameColumn = input.name_column && columns.includes(input.name_column) ? input.name_column : null;
  const socialColumn = input.social_column && columns.includes(input.social_column) ? input.social_column : null;

  const { error } = await createSupabaseAdminClient()
    .from("outreach_campaigns")
    .update({
      name,
      agent_id: input.agent_id || null,
      channel_type: input.agent_id ? channel : null,
      outreach_prompt: input.outreach_prompt.slice(0, 6000),
      min_delay_minutes: min,
      max_delay_minutes: max,
      daily_limit: daily,
      contact_column: contactColumn,
      website_column: websiteColumn,
      name_column: nameColumn,
      social_column: socialColumn,
      message_type: messageType,
      fixed_message: input.fixed_message.slice(0, 4000),
      delay_mode: delayMode,
      fixed_delay_minutes: fixedDelay,
      webhook_url: webhook,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) return fail(error.message);

  revalidatePath("/outreach");
  return { ok: true };
}

export type ImportChunk = {
  columns: string[];
  rows: Array<Record<string, string>>;
  /** Первый кусок заменяет базу целиком, остальные дописываются. */
  replace: boolean;
  startIndex: number;
  contact_column: string;
  website_column: string | null;
  name_column?: string | null;
  social_column?: string | null;
};

export async function importContacts(id: string, chunk: ImportChunk): Promise<Result> {
  const userId = await getAuthenticatedUserId();
  const campaign = await getCampaign(userId, id);
  if (!campaign) return fail("Рассылка не найдена.");
  if (campaign.status === "active") return fail("Остановите рассылку перед заменой базы.");

  const columns = chunk.columns.map((column) => String(column).slice(0, 80));
  if (columns.length === 0 || columns.length > 60) return fail("Файл должен содержать от 1 до 60 колонок.");
  if (!columns.includes(chunk.contact_column)) return fail("Укажите колонку с номером или email.");
  if (chunk.website_column && !columns.includes(chunk.website_column)) return fail("Колонка сайта не найдена в файле.");
  if (chunk.name_column && !columns.includes(chunk.name_column)) return fail("Колонка имени не найдена в файле.");
  if (chunk.social_column && !columns.includes(chunk.social_column)) return fail("Колонка соцсетей не найдена в файле.");
  if (chunk.startIndex + chunk.rows.length > OUTREACH_MAX_ROWS) return fail(`Максимум ${OUTREACH_MAX_ROWS} строк в одной базе.`);

  const supabase = createSupabaseAdminClient();
  if (chunk.replace) {
    const { error } = await supabase.from("outreach_logs").delete().eq("campaign_id", id);
    if (error) return fail(error.message);
    const { error: updateError } = await supabase
      .from("outreach_campaigns")
      .update({
        source_columns: columns,
        contact_column: chunk.contact_column,
        website_column: chunk.website_column,
        name_column: chunk.name_column ?? null,
        social_column: chunk.social_column ?? null,
        status: "draft",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId);
    if (updateError) return fail(updateError.message);
  }

  const records = chunk.rows.map((row, offset) => ({
    campaign_id: id,
    row_index: chunk.startIndex + offset,
    contact_data: Object.fromEntries(columns.map((column) => [column, String(row[column] ?? "").slice(0, 2000)])),
    strike_status: "queued",
  }));
  if (records.length > 0) {
    const { error } = await supabase.from("outreach_logs").insert(records);
    if (error) return fail(error.message);
  }
  revalidatePath("/outreach");
  return { ok: true };
}

export async function controlCampaign(id: string, action: "start" | "pause" | "stop"): Promise<Result> {
  const userId = await getAuthenticatedUserId();
  const campaign = await getCampaign(userId, id);
  if (!campaign) return fail("Рассылка не найдена.");
  const supabase = createSupabaseAdminClient();

  if (action === "pause") {
    await supabase.from("outreach_campaigns").update({ status: "paused" }).eq("id", id).eq("user_id", userId);
    return { ok: true, message: "Рассылка на паузе" };
  }
  if (action === "stop") {
    await supabase.from("outreach_campaigns").update({ status: "completed" }).eq("id", id).eq("user_id", userId);
    return { ok: true, message: "Рассылка остановлена" };
  }

  if (campaign.status === "active") return fail("Рассылка уже запущена.");
  if (!campaign.agent_id || !campaign.channel_type) return fail("Выберите агента и канал во вкладке «Настройки».");
  if (campaign.message_type === "fixed") {
    if (!campaign.fixed_message.trim()) return fail("Заполните текст сообщения во вкладке «Настройки».");
  } else if (!campaign.outreach_prompt.trim()) {
    return fail("Заполните инструкцию для первого сообщения.");
  }
  if (!campaign.contact_column) return fail("Загрузите базу и укажите колонку с номером.");
  const agent = (await listAgentOptions()).find((item) => item.id === campaign.agent_id);
  if (!agent?.channels.includes(campaign.channel_type)) return fail("Выбранный канал больше не активен у агента.");
  if (!outreachQueueConfigured()) {
    return fail("Очередь фоновых задач не настроена: добавьте QSTASH_TOKEN, OUTREACH_WORKER_SECRET и OUTREACH_WORKER_URL.");
  }

  // Суточный лимит (UTC-сутки, как в воркере): вычитаем уже отправленное сегодня.
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await supabase
    .from("outreach_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", id)
    .eq("strike_status", "success")
    .gte("strike_sent_time", dayStart.toISOString());
  const remaining = campaign.daily_limit - (sentToday ?? 0);
  if (remaining <= 0) return fail("Суточный лимит на сегодня уже выбран. Запустите рассылку завтра или увеличьте лимит.");

  const { data: queued, error } = await supabase
    .from("outreach_logs")
    .select("id")
    .eq("campaign_id", id)
    .eq("strike_status", "queued")
    .order("row_index", { ascending: true })
    .is("strike_error", null)
    .limit(remaining);
  if (error) return fail(error.message);
  if (!queued?.length) return fail("В базе нет строк в очереди.");

  const result = await enqueueLogs(
    queued.map((row) => String(row.id)),
    {
      mode: campaign.delay_mode,
      minMinutes: campaign.min_delay_minutes,
      maxMinutes: campaign.max_delay_minutes,
      fixedMinutes: campaign.fixed_delay_minutes,
    },
  );
  if (result.error && result.queued === 0) return fail(result.error);

  await supabase.from("outreach_campaigns").update({ status: "active" }).eq("id", id).eq("user_id", userId);
  revalidatePath("/outreach");
  return { ok: true, message: `Рассылка запущена: в очереди ${result.queued} сообщений` };
}

export async function deleteCampaign(id: string): Promise<Result> {
  const userId = await getAuthenticatedUserId();
  const { error } = await createSupabaseAdminClient().from("outreach_campaigns").delete().eq("id", id).eq("user_id", userId);
  if (error) return fail(error.message);
  revalidatePath("/outreach");
  return { ok: true };
}
