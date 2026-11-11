"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getCampaign, listAgentOptions, scheduleOpenBatch } from "@/lib/outreach";
import { outreachQueueConfigured } from "@/lib/outreach-queue";
import { readTimeZone, readWorkTime } from "@/lib/outreach-schedule";
import { getOpenAI } from "@/lib/openai";
import {
  DEFAULT_OUTREACH_LANGUAGE,
  OUTREACH_LANGUAGES,
  OUTREACH_MAX_ROWS,
  readOutreachChannel,
  type OutreachChannel,
  type OutreachDelayMode,
  type OutreachMessageType,
} from "@/lib/outreach-types";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Result = { ok: true; message?: string } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

const DEFAULT_NAME = "Новая кампания";

/** «Новая кампания», «Новая кампания (1)», «Новая кампания (2)»…: первое свободное имя среди кампаний пользователя. */
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

/** «+ Новая кампания»: создаёт черновик в БД и переводит на рабочую область кампании. */
export async function createCampaignDraft(timezoneInput?: string) {
  const userId = await getAuthenticatedUserId();
  const supabase = createSupabaseAdminClient();
  const name = await nextDraftName(userId);
  const timezone = readTimeZone(timezoneInput);
  let result = await supabase
    .from("outreach_campaigns")
    .insert({ user_id: userId, name, status: "draft", work_time_start: "09:00", work_time_end: "18:00", timezone })
    .select("id")
    .single();
  if (result.error && /work_time_start|timezone/.test(result.error.message)) {
    result = await supabase.from("outreach_campaigns").insert({ user_id: userId, name, status: "draft" }).select("id").single();
  }
  const { data, error } = result;
  if (error || !data) {
    throw new Error(error?.message.includes("outreach_campaigns") ? "Примените миграцию 20261104_outreach.sql." : (error?.message ?? "Не удалось создать кампанию."));
  }
  revalidatePath("/leads");
  redirect(`/leads/${data.id}`);
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
  fallback_message: string;
  language: string;
  delay_mode: OutreachDelayMode;
  fixed_delay_minutes: number;
  webhook_url: string | null;
  work_time_start: string;
  work_time_end: string;
  timezone: string;
};

export async function saveCampaignSettings(id: string, input: CampaignSettingsInput): Promise<Result> {
  const userId = await getAuthenticatedUserId();
  const campaign = await getCampaign(userId, id);
  if (!campaign) return fail("Кампания не найдена.");
  if (campaign.status === "active") return fail("Поставьте кампанию на паузу, чтобы изменить настройки.");

  const name = input.name.trim().slice(0, 120) || DEFAULT_NAME;
  const min = Math.max(0, Math.min(1440, Math.round(Number(input.min_delay_minutes) || 0)));
  const max = Math.max(min, Math.min(1440, Math.round(Number(input.max_delay_minutes) || 0)));
  const fixedDelay = Math.max(0, Math.min(1440, Math.round(Number(input.fixed_delay_minutes) || 0)));
  const delayMode: OutreachDelayMode = input.delay_mode === "fixed" ? "fixed" : "random";
  const messageType: OutreachMessageType = input.message_type === "fixed" ? "fixed" : "ai";
  const daily = Math.max(1, Math.min(5000, Math.round(Number(input.daily_limit) || 1)));
  const workStart = readWorkTime(input.work_time_start, "");
  const workEnd = readWorkTime(input.work_time_end, "");
  if (!workStart || !workEnd) return fail("Укажите время начала и окончания.");
  if (workStart >= workEnd) return fail("Время окончания должно быть позже времени начала.");
  const timezone = readTimeZone(input.timezone);
  if (input.timezone.trim() && timezone !== input.timezone.trim()) return fail("Неизвестный часовой пояс.");

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
      fallback_message: String(input.fallback_message ?? "").slice(0, 4000),
      language: (OUTREACH_LANGUAGES as readonly string[]).includes(input.language) ? input.language : DEFAULT_OUTREACH_LANGUAGE,
      delay_mode: delayMode,
      fixed_delay_minutes: fixedDelay,
      webhook_url: webhook,
      work_time_start: workStart,
      work_time_end: workEnd,
      timezone,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);
  if (error) return fail(/work_time_start|timezone/.test(error.message) ? "Примените миграцию 20261111_outreach_work_schedule.sql." : error.message);

  revalidatePath("/leads");
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
  if (!campaign) return fail("Кампания не найдена.");
  if (campaign.status === "active") return fail("Остановите кампанию перед заменой базы.");

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
  revalidatePath("/leads");
  return { ok: true };
}

export async function controlCampaign(id: string, action: "start" | "pause" | "stop"): Promise<Result> {
  const userId = await getAuthenticatedUserId();
  const campaign = await getCampaign(userId, id);
  if (!campaign) return fail("Кампания не найдена.");
  const supabase = createSupabaseAdminClient();

  if (action === "pause") {
    await supabase.from("outreach_campaigns").update({ status: "paused" }).eq("id", id).eq("user_id", userId);
    return { ok: true, message: "Кампания на паузе" };
  }
  if (action === "stop") {
    await supabase.from("outreach_campaigns").update({ status: "completed" }).eq("id", id).eq("user_id", userId);
    return { ok: true, message: "Кампания остановлена" };
  }

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

  // Строки, зависшие в обработке после сбоя функции, возвращаем в очередь (кампания не активна, воркеры их пропускают).
  await supabase.from("outreach_logs").update({ strike_error: null }).eq("campaign_id", id).eq("strike_status", "queued").eq("strike_error", "processing");

  const countWaiting = (marker: "scheduled" | null) => {
    const query = supabase.from("outreach_logs").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("strike_status", "queued");
    return marker ? query.eq("strike_error", marker) : query.is("strike_error", null);
  };
  const [unscheduled, alreadyScheduled] = await Promise.all([countWaiting(null), countWaiting("scheduled")]);
  if (unscheduled.error) return fail(unscheduled.error.message);
  if (alreadyScheduled.error) return fail(alreadyScheduled.error.message);
  if (!(unscheduled.count || alreadyScheduled.count)) return fail("В базе нет строк в очереди.");

  // Статус ставится ДО публикации в очередь: первое сообщение уходит без задержки,
  // и воркер иначе успевает увидеть ещё не активную кампанию и пропустить строку навсегда.
  const { error: statusError } = await supabase.from("outreach_campaigns").update({ status: "active" }).eq("id", id).eq("user_id", userId);
  if (statusError) return fail(statusError.message);

  const result = await scheduleOpenBatch(id);
  if (result.error && result.queued === 0) {
    await supabase.from("outreach_campaigns").update({ status: campaign.status }).eq("id", id).eq("user_id", userId);
    return fail(result.error);
  }
  revalidatePath("/leads");
  if (result.opensAt) return { ok: true, message: "Кампания запущена. Отправка начнётся в рабочем окне." };
  if (result.queued > 0) return { ok: true, message: `Кампания запущена: в очереди ${result.queued} сообщений` };
  return { ok: true, message: "Кампания запущена" };
}

export async function deleteCampaign(id: string): Promise<Result> {
  const userId = await getAuthenticatedUserId();
  const { error } = await createSupabaseAdminClient().from("outreach_campaigns").delete().eq("id", id).eq("user_id", userId);
  if (error) return fail(error.message);
  revalidatePath("/leads");
  return { ok: true };
}

/** Предлагает инструкцию для первого холодного сообщения по системному промпту выбранного агента. */
const bad = (error: string) => ({ ok: false as const, error });

export async function generateOutreachInstruction(agentId: string): Promise<{ ok: true; instruction: string } | { ok: false; error: string }> {
  try {
    const userId = await getAuthenticatedUserId();
    if (!agentId) return bad("Сначала выберите агента.");
    const { data: agent } = await createSupabaseAdminClient()
      .from("agents")
      .select("system_prompt")
      .eq("id", agentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!agent) return bad("Агент не найден.");
    const systemPrompt = String(agent.system_prompt ?? "").trim().slice(0, 6000);
    if (!systemPrompt) return bad("У агента пустая системная инструкция: не на что опираться.");

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.9,
      messages: [
        {
          role: "system",
          content: "Ты помогаешь настроить кампании лидогенерации для AI-агентов. Отвечай только текстом инструкции, без кавычек, заголовков и пояснений.",
        },
        {
          role: "user",
          content: `Проанализируй базовую инструкцию этого AI-агента: ${systemPrompt}\n\nНапиши короткую инструкцию (1-2 предложения) для генерации самого первого исходящего сообщения, чтобы оно соответствовало стилю агента и плавно переводило диалог в его воронку.`,
        },
      ],
    });
    const instruction = completion.choices[0]?.message?.content?.trim().replace(/^["«]|["»]$/g, "") ?? "";
    if (!instruction) return bad("Модель вернула пустой ответ. Попробуйте ещё раз.");
    return { ok: true, instruction };
  } catch (error) {
    return bad(error instanceof Error ? error.message : "Не удалось сгенерировать инструкцию.");
  }
}
