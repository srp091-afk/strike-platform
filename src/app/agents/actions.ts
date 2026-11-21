"use server";

import { revalidatePath } from "next/cache";

import {
  DEFAULT_ACTIVE_CHANNELS,
  isAgentModel,
  readHandoffDuration,
  readMessageLimit,
  readChannelDelays,
  readSplitMessages,
  type ActiveChannels,
  type HandoffDuration,
} from "@/lib/agent-models";
import { readAmoDomain } from "@/lib/amocrm";
import { readBitrixWebhook } from "@/lib/bitrix24";
import { readDikidiBookingUrl, readYclientsCompanyId, readYclientsPlatform, readYclientsToken } from "@/lib/yclients";
import { readPaymentReturnUrl, readPaymentSecret, readProdamusShopUrl, readStripeCurrency } from "@/lib/payments";
import { getEffectiveUserId } from "@/lib/account-context";
import { assertCanCreateAgent } from "@/lib/access";
import { ensureGreenIncomingWebhook, getGreenPhone } from "@/lib/green-api";
import { leadEmailSettingsSchema } from "@/lib/lead-notify";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type SaveState = {
  ok: boolean;
  error: string | null;
  savedId: string | null;
  attemptId: string | null;
  agentId: string | null;
  waPhoneNumber: string | null;
};

function readAgentFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const systemPrompt = String(formData.get("system_prompt") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const temperature = Number(formData.get("temperature") ?? 0.7);
  const channelDelays = readDelays(formData.get("channel_delays"));
  const humanHandoff = readHandoff(formData.get("human_handoff_duration"));
  const agentMessageLimit = readLimit(formData.get("limit_agent_messages"));
  const clientMessageLimit = readLimit(formData.get("limit_client_messages"));
  const totalMessageLimit = readLimit(formData.get("limit_total_messages"));
  const splitMessages = readSplitMessages(formData.get("split_messages"));
  const followupEnabled = readSplitMessages(formData.get("followup_enabled"));
  const followupInterval = readPositiveInt(formData.get("followup_interval_hours"), 24, 1, 24 * 30);
  const followupMaxCount = readPositiveInt(formData.get("followup_max_count"), 2, 0, 20);
  const followupTemplate = String(formData.get("followup_template") ?? "").trim().slice(0, 2000);
  const id = String(formData.get("id") ?? "").trim();
  const activeChannels = readChannels(formData.get("active_channels"));
  const waInstanceId = String(formData.get("wa_instance_id") ?? "").trim();
  const waApiToken = String(formData.get("wa_api_token") ?? "").trim();
  const waPhoneNumber = String(formData.get("wa_phone_number") ?? "").replace(/@c\.us$/i, "").replace(/\D/g, "");
  const telegramChatId = readTelegramChatId(formData.get("telegram_chat_id"));
  const emailSettings = leadEmailSettingsSchema.safeParse({
    notify_email_enabled: formData.get("notify_email_enabled") === "true",
    notify_email_address: String(formData.get("notify_email_address") ?? ""),
  });

  if (!name) {
    return { ok: false as const, error: "Укажи имя агента." };
  }

  if (!isAgentModel(model)) {
    return { ok: false as const, error: "Выбери модель из списка." };
  }

  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return { ok: false as const, error: "Температура должна быть от 0 до 2." };
  }

  if (agentMessageLimit === null || clientMessageLimit === null || totalMessageLimit === null) {
    return { ok: false as const, error: "Лимит сообщений должен быть целым числом от 0." };
  }

  if ((waInstanceId || waApiToken) && (!/^\d{4,}$/.test(waInstanceId) || waApiToken.length < 8)) {
    return { ok: false as const, error: "Укажите Instance ID и API Token WhatsApp." };
  }

  if (telegramChatId === null) {
    return { ok: false as const, error: "ID чата Telegram должен быть числом, например -100123456789." };
  }

  if (!emailSettings.success) {
    return { ok: false as const, error: emailSettings.error.issues[0]?.message ?? "Проверьте email для уведомлений." };
  }

  if (followupInterval === null || followupMaxCount === null) {
    return {
      ok: false as const,
      error: "Интервал напоминаний — целое число часов от 1, лимит напоминаний — целое число от 0.",
    };
  }

  const webhookProvided = formData.has("webhook_url") || formData.has("webhook_secret");
  const webhookUrl = String(formData.get("webhook_url") ?? "").trim().slice(0, 2000);
  const webhookSecret = String(formData.get("webhook_secret") ?? "").trim().slice(0, 200);
  if (webhookProvided && webhookUrl && !webhookUrl.startsWith("http://") && !webhookUrl.startsWith("https://")) {
    return { ok: false as const, error: "Webhook URL должен начинаться с http:// или https://." };
  }

  const amoProvided = formData.has("amo_domain") || formData.has("amo_pipeline_id") || formData.has("amo_handoff_status_id");
  const amoDomain = readAmoDomain(String(formData.get("amo_domain") ?? ""));
  const amoToken = String(formData.get("amo_access_token") ?? "").trim().slice(0, 4000);
  const amoPipelineId = readOptionalBigint(formData.get("amo_pipeline_id"));
  const amoStatusId = readOptionalBigint(formData.get("amo_handoff_status_id"));
  if (amoProvided && amoDomain === null) {
    return { ok: false as const, error: "Домен amoCRM должен быть вида company.amocrm.ru или company.kommo.com." };
  }
  if (amoPipelineId === undefined || amoStatusId === undefined) {
    return { ok: false as const, error: "ID воронки и этапа amoCRM должны быть числами." };
  }

  const pipedriveProvided = formData.has("pipedrive_api_token") || formData.has("pipedrive_pipeline_id") || formData.has("pipedrive_handoff_stage_id");
  const pipedriveToken = String(formData.get("pipedrive_api_token") ?? "").trim().slice(0, 4000);
  const pipedrivePipelineId = readOptionalBigint(formData.get("pipedrive_pipeline_id"));
  const pipedriveStageId = readOptionalBigint(formData.get("pipedrive_handoff_stage_id"));
  if (pipedrivePipelineId === undefined || pipedriveStageId === undefined) {
    return { ok: false as const, error: "ID воронки и этапа Pipedrive должны быть числами." };
  }

  const bitrixProvided = formData.has("bitrix_webhook_url") || formData.has("bitrix_openline_id") || formData.has("bitrix_responsible_id") || formData.has("bitrix_handoff_status_id");
  const bitrixWebhookRaw = String(formData.get("bitrix_webhook_url") ?? "");
  const bitrixWebhook = readBitrixWebhook(bitrixWebhookRaw);
  const bitrixOpenLineId = readOptionalCode(formData.get("bitrix_openline_id"));
  const bitrixResponsibleId = readOptionalBigint(formData.get("bitrix_responsible_id"));
  const bitrixStatusId = readOptionalCode(formData.get("bitrix_handoff_status_id"));
  if (formData.has("bitrix_webhook_url") && bitrixWebhookRaw.trim() && bitrixWebhook === null) {
    return { ok: false as const, error: "Входящий вебхук Битрикс24 должен быть вида https://company.bitrix24.ru/rest/1/код/." };
  }
  if (bitrixOpenLineId === undefined || bitrixStatusId === undefined) {
    return { ok: false as const, error: "ID Открытой Линии и стадии лида Битрикс24 содержат недопустимые символы." };
  }
  if (bitrixResponsibleId === undefined) {
    return { ok: false as const, error: "ID ответственного сотрудника Битрикс24 должен быть числом." };
  }

  const yclientsProvided = formData.has("yclients_platform") || formData.has("yclients_company_id") || formData.has("yclients_partner_token") || formData.has("yclients_user_token");
  const yclientsPlatform = readYclientsPlatform(String(formData.get("yclients_platform") ?? ""));
  const yclientsCompanyId = readYclientsCompanyId(String(formData.get("yclients_company_id") ?? ""));
  const yclientsPartnerToken = readYclientsToken(String(formData.get("yclients_partner_token") ?? ""));
  const yclientsUserToken = readYclientsToken(String(formData.get("yclients_user_token") ?? ""));
  if (yclientsProvided && !yclientsPlatform) {
    return { ok: false as const, error: "Платформа записи — YCLIENTS или Altegio." };
  }
  if (formData.has("yclients_company_id") && yclientsCompanyId === null) {
    return { ok: false as const, error: "ID филиала YCLIENTS должен быть числом." };
  }
  if (formData.has("yclients_partner_token") && yclientsPartnerToken === null) {
    return { ok: false as const, error: "Partner Token содержит пробелы или слишком короткий." };
  }
  if (formData.has("yclients_user_token") && yclientsUserToken === null) {
    return { ok: false as const, error: "User Token содержит пробелы или слишком короткий." };
  }

  const dikidiProvided = formData.has("dikidi_booking_url");
  const dikidiUrl = readDikidiBookingUrl(String(formData.get("dikidi_booking_url") ?? ""));
  if (dikidiProvided && dikidiUrl === null) {
    return { ok: false as const, error: "Ссылка DIKIDI должна быть https-адресом на dikidi.net, dikidi.ru или dikidi.app." };
  }

  const stripeProvided = formData.has("stripe_currency") || formData.has("stripe_secret_key") || formData.has("stripe_webhook_secret");
  const stripeCurrency = readStripeCurrency(String(formData.get("stripe_currency") ?? ""));
  const stripeSecret = readPaymentSecret(String(formData.get("stripe_secret_key") ?? ""));
  const stripeWebhookSecret = readPaymentSecret(String(formData.get("stripe_webhook_secret") ?? ""));
  if (stripeProvided && !stripeCurrency) return { ok: false as const, error: "Валюта Stripe: USD, EUR, GBP или GEL." };
  if (formData.has("stripe_secret_key") && stripeSecret === null) return { ok: false as const, error: "Secret Key Stripe содержит пробелы или слишком короткий." };
  if (formData.has("stripe_webhook_secret") && stripeWebhookSecret === null) return { ok: false as const, error: "Webhook Secret Stripe содержит пробелы или слишком короткий." };

  const yookassaProvided = formData.has("yookassa_shop_id") || formData.has("yookassa_secret_key");
  const yookassaShopId = String(formData.get("yookassa_shop_id") ?? "").trim();
  const yookassaSecret = readPaymentSecret(String(formData.get("yookassa_secret_key") ?? ""));
  if (formData.has("yookassa_shop_id") && yookassaShopId && !/^\d{1,20}$/.test(yookassaShopId)) {
    return { ok: false as const, error: "Shop ID ЮKassa должен быть числом." };
  }
  if (formData.has("yookassa_secret_key") && yookassaSecret === null) return { ok: false as const, error: "Секретный ключ ЮKassa содержит пробелы или слишком короткий." };

  const prodamusProvided = formData.has("prodamus_shop_url") || formData.has("prodamus_secret_key");
  const prodamusShopUrl = readProdamusShopUrl(String(formData.get("prodamus_shop_url") ?? ""));
  const prodamusSecret = readPaymentSecret(String(formData.get("prodamus_secret_key") ?? ""));
  if (formData.has("prodamus_shop_url") && prodamusShopUrl === null) {
    return { ok: false as const, error: "URL Продамус должен быть https-адресом на payform.ru." };
  }
  if (formData.has("prodamus_secret_key") && prodamusSecret === null) return { ok: false as const, error: "Секретный ключ Продамус содержит пробелы или слишком короткий." };

  const paymentMessageProvided = formData.has("payment_success_message");
  const paymentReturnProvided = formData.has("payment_return_url");
  const paymentSuccessMessage = String(formData.get("payment_success_message") ?? "").trim().slice(0, 2000);
  const paymentReturnUrl = readPaymentReturnUrl(String(formData.get("payment_return_url") ?? ""));
  if (paymentReturnProvided && paymentReturnUrl === null) {
    return { ok: false as const, error: "URL возврата после оплаты должен начинаться с https://." };
  }

  return {
    ok: true as const,
    followupEnabled,
    followupInterval,
    followupMaxCount,
    followupTemplate,
    id,
    name,
    systemPrompt,
    model,
    temperature,
    channelDelays,
    humanHandoff,
    agentMessageLimit,
    clientMessageLimit,
    totalMessageLimit,
    splitMessages,
    activeChannels,
    waInstanceId,
    waApiToken,
    waPhoneNumber,
    telegramChatId,
    notifyEmailEnabled: emailSettings.data.notify_email_enabled,
    notifyEmailAddress: emailSettings.data.notify_email_address,
    webhookUrl: webhookProvided ? webhookUrl : undefined,
    webhookSecret: webhookProvided ? webhookSecret : undefined,
    amoProvided,
    amoDomain: amoDomain || "",
    amoToken,
    amoPipelineId,
    amoStatusId,
    pipedriveProvided,
    pipedriveToken,
    pipedrivePipelineId,
    pipedriveStageId,
    bitrixProvided,
    bitrixWebhook: bitrixWebhook || "",
    bitrixOpenLineId,
    bitrixResponsibleId,
    bitrixStatusId,
    yclientsProvided,
    yclientsPlatform: yclientsPlatform || "yclients",
    yclientsCompanyId: yclientsCompanyId || "",
    yclientsPartnerToken: yclientsPartnerToken || "",
    yclientsUserToken: yclientsUserToken || "",
    dikidiProvided,
    dikidiUrl: dikidiUrl || "",
    stripeProvided,
    stripeCurrency: stripeCurrency || "usd",
    stripeSecret: stripeSecret || "",
    stripeWebhookSecret: stripeWebhookSecret || "",
    yookassaProvided,
    yookassaShopId,
    yookassaSecret: yookassaSecret || "",
    prodamusProvided,
    prodamusShopUrl: prodamusShopUrl || "",
    prodamusSecret: prodamusSecret || "",
    paymentMessageProvided,
    paymentSuccessMessage,
    paymentReturnProvided,
    paymentReturnUrl: paymentReturnUrl || "",
  };
}

function readOptionalCode(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const code = value.trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) return undefined;
  return code;
}

function readOptionalBigint(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (!/^\d{1,18}$/.test(value.trim())) return undefined;
  return value.trim();
}

function readTelegramChatId(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return "";
  const chatId = value.trim();
  if (!/^-?\d{5,20}$/.test(chatId)) return null;
  return chatId;
}

/** Целое число в диапазоне. Пусто — значение по умолчанию, мусор или выход за диапазон — null (ошибка). */
function readPositiveInt(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function readLimit(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return 0;
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit < 0 || !Number.isInteger(limit)) return null;
  return readMessageLimit(limit);
}

function readHandoff(value: FormDataEntryValue | null): HandoffDuration {
  return readHandoffDuration(value);
}

/** JSON {"whatsapp": 0, "telegram": 0, "instagram": 0, "web_widget": 0}; значения приводятся к допустимым границам. */
function readDelays(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return readChannelDelays(JSON.parse(value));
  } catch {
    return null;
  }
}

function readChannels(value: FormDataEntryValue | null): ActiveChannels {
  if (typeof value !== "string" || !value.trim()) return { ...DEFAULT_ACTIVE_CHANNELS };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      whatsapp: parsed.whatsapp === true,
      telegram: parsed.telegram === true,
      instagram: parsed.instagram === true,
      widget: parsed.widget === true,
    };
  } catch {
    return { ...DEFAULT_ACTIVE_CHANNELS };
  }
}

/**
 * Программное сохранение агента из клиентского кода (автосейв перед открытием
 * модалок каналов у нового агента). Тот же путь записи, что и у submit формы.
 */
export async function saveAgentDirect(formData: FormData): Promise<SaveState> {
  return persistAgent(formData);
}

export async function saveAgent(_prev: SaveState, formData: FormData): Promise<SaveState> {
  return persistAgent(formData);
}

async function persistAgent(formData: FormData): Promise<SaveState> {
  const fields = readAgentFields(formData);
  if (!fields.ok) {
    return failedSave(fields.error);
  }

  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getEffectiveUserId();
    const manualPhone = /^\d{8,15}$/.test(fields.waPhoneNumber) ? fields.waPhoneNumber : null;
    const waPhoneNumber = (await readWhatsAppPhone(fields.waInstanceId, fields.waApiToken)) || manualPhone;
    const payload = {
      name: fields.name,
      system_prompt: fields.systemPrompt,
      model: fields.model,
      temperature: fields.temperature,
      // Поле отсутствует только у старых клиентов: тогда сохранённые задержки не трогаем.
      ...(fields.channelDelays ? { channel_delays: fields.channelDelays } : {}),
      human_handoff_duration: fields.humanHandoff,
      limit_agent_messages: fields.agentMessageLimit,
      limit_client_messages: fields.clientMessageLimit,
      limit_total_messages: fields.totalMessageLimit,
      split_messages: fields.splitMessages,
      followup_enabled: fields.followupEnabled,
      followup_interval_hours: fields.followupInterval,
      followup_max_count: fields.followupMaxCount,
      followup_template: fields.followupTemplate || null,
      telegram_chat_id: fields.telegramChatId || null,
      notify_email_enabled: fields.notifyEmailEnabled,
      notify_email_address: fields.notifyEmailAddress || null,
      ...(fields.webhookUrl !== undefined
        ? { webhook_url: fields.webhookUrl || null, webhook_secret: fields.webhookSecret || null }
        : {}),
      ...(fields.amoProvided
        ? {
            amo_domain: fields.amoDomain || null,
            amo_pipeline_id: fields.amoPipelineId ? Number(fields.amoPipelineId) : null,
            amo_handoff_status_id: fields.amoStatusId ? Number(fields.amoStatusId) : null,
            ...(fields.amoToken ? { amo_access_token: fields.amoToken } : {}),
          }
        : {}),
      ...(fields.pipedriveProvided
        ? {
            pipedrive_pipeline_id: fields.pipedrivePipelineId ? Number(fields.pipedrivePipelineId) : null,
            pipedrive_handoff_stage_id: fields.pipedriveStageId ? Number(fields.pipedriveStageId) : null,
            ...(fields.pipedriveToken ? { pipedrive_api_token: fields.pipedriveToken } : {}),
          }
        : {}),
      ...(fields.bitrixProvided
        ? {
            bitrix_openline_id: fields.bitrixOpenLineId,
            bitrix_responsible_id: fields.bitrixResponsibleId ? Number(fields.bitrixResponsibleId) : null,
            bitrix_handoff_status_id: fields.bitrixStatusId,
            ...(fields.bitrixWebhook ? { bitrix_webhook_url: fields.bitrixWebhook } : {}),
          }
        : {}),
      ...(fields.yclientsProvided
        ? {
            yclients_platform: fields.yclientsPlatform,
            yclients_company_id: fields.yclientsCompanyId || null,
            ...(fields.yclientsPartnerToken ? { yclients_partner_token: fields.yclientsPartnerToken } : {}),
            ...(fields.yclientsUserToken ? { yclients_user_token: fields.yclientsUserToken } : {}),
          }
        : {}),
      ...(fields.dikidiProvided ? { dikidi_booking_url: fields.dikidiUrl || null } : {}),
      ...(fields.stripeProvided
        ? {
            stripe_currency: fields.stripeCurrency,
            ...(fields.stripeSecret ? { stripe_secret_key: fields.stripeSecret } : {}),
            ...(fields.stripeWebhookSecret ? { stripe_webhook_secret: fields.stripeWebhookSecret } : {}),
          }
        : {}),
      ...(fields.yookassaProvided
        ? {
            yookassa_shop_id: fields.yookassaShopId || null,
            ...(fields.yookassaSecret ? { yookassa_secret_key: fields.yookassaSecret } : {}),
          }
        : {}),
      ...(fields.prodamusProvided
        ? {
            prodamus_shop_url: fields.prodamusShopUrl || null,
            ...(fields.prodamusSecret ? { prodamus_secret_key: fields.prodamusSecret } : {}),
          }
        : {}),
      ...(fields.paymentMessageProvided ? { payment_success_message: fields.paymentSuccessMessage || null } : {}),
      ...(fields.paymentReturnProvided ? { payment_return_url: fields.paymentReturnUrl || null } : {}),
      active_channels: fields.activeChannels,
      user_id: userId,
      ...(fields.waInstanceId && fields.waApiToken
        ? {
            wa_instance_id: fields.waInstanceId,
            wa_api_token: fields.waApiToken,
            wa_is_active: true,
            ...(waPhoneNumber ? { wa_phone_number: waPhoneNumber } : {}),
          }
        : {}),
    };

    // Уже подключённые номера подтягиваем до актуальных настроек вебхуков (исходящие с телефона).
    if (fields.waInstanceId && fields.waApiToken) {
      await ensureGreenIncomingWebhook({ idInstance: fields.waInstanceId, apiToken: fields.waApiToken }).catch(
        (error) => console.error("[agents] green webhook", error instanceof Error ? error.message : error),
      );
    }

    const emailRequested = fields.notifyEmailEnabled || Boolean(fields.notifyEmailAddress);
    const webhookRequested = Boolean(fields.webhookUrl || fields.webhookSecret);
    const amoRequested = Boolean(fields.amoDomain || fields.amoToken || fields.amoPipelineId || fields.amoStatusId);
    const pipedriveRequested = Boolean(fields.pipedriveToken || fields.pipedrivePipelineId || fields.pipedriveStageId);
    const bitrixRequested = Boolean(fields.bitrixWebhook || fields.bitrixOpenLineId || fields.bitrixResponsibleId || fields.bitrixStatusId);
    const yclientsRequested = Boolean(fields.yclientsCompanyId || fields.yclientsPartnerToken || fields.yclientsUserToken);
    const dikidiRequested = Boolean(fields.dikidiUrl);
    const stripeRequested = Boolean(fields.stripeSecret || fields.stripeWebhookSecret || (fields.stripeCurrency && fields.stripeCurrency !== "usd"));
    const yookassaRequested = Boolean(fields.yookassaShopId || fields.yookassaSecret);
    const prodamusRequested = Boolean(fields.prodamusShopUrl || fields.prodamusSecret);
    const paymentCopyRequested = Boolean(fields.paymentSuccessMessage || fields.paymentReturnUrl);
    let agentId = fields.id;
    if (fields.id) {
      const updated = await supabase
        .from("agents")
        .update(payload)
        .eq("id", fields.id)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();
      const updateFallback = updated.error ? dropUnavailableColumns(payload, updated.error.message, { emailRequested, webhookRequested, amoRequested, pipedriveRequested, bitrixRequested, yclientsRequested, dikidiRequested, stripeRequested, yookassaRequested, prodamusRequested, paymentCopyRequested }) : null;
      const retried = updateFallback
        ? await supabase.from("agents").update(updateFallback).eq("id", fields.id).eq("user_id", userId).select("id").maybeSingle()
        : updated;

      if (retried.error) {
        return failedSave(columnError(retried.error.message));
      }

      if (!retried.data) {
        return failedSave("Агент не найден.");
      }
    } else {
      await assertCanCreateAgent(userId);
      const inserted = await supabase.from("agents").insert(payload).select("id").single();
      const insertFallback = inserted.error ? dropUnavailableColumns(payload, inserted.error.message, { emailRequested, webhookRequested, amoRequested, pipedriveRequested, bitrixRequested, yclientsRequested, dikidiRequested, stripeRequested, yookassaRequested, prodamusRequested, paymentCopyRequested }) : null;
      const retried = insertFallback ? await supabase.from("agents").insert(insertFallback).select("id").single() : inserted;
      if (retried.error || !retried.data) {
        return failedSave(columnError(retried.error?.message ?? "Не удалось сохранить агента."));
      }
      agentId = String(retried.data.id);
    }

    revalidatePath("/dashboard");
    revalidatePath("/agents");
    return {
      ok: true,
      error: null,
      savedId: crypto.randomUUID(),
      attemptId: crypto.randomUUID(),
      agentId,
      waPhoneNumber,
    };
  } catch (error) {
    return failedSave(error instanceof Error ? error.message : "Не удалось сохранить агента.");
  }
}

async function readWhatsAppPhone(instanceId: string, apiToken: string) {
  if (!instanceId || !apiToken) return null;
  try {
    const phone = await getGreenPhone({ idInstance: instanceId, apiToken });
    const digits = phone.replace(/\D/g, "");
    return digits ? digits.slice(0, 40) : null;
  } catch {
    return null;
  }
}

function dropUnavailableColumns<T extends Record<string, unknown>>(
  payload: T,
  message: string,
  requested: {
    emailRequested: boolean;
    webhookRequested: boolean;
    amoRequested: boolean;
    pipedriveRequested: boolean;
    bitrixRequested: boolean;
    yclientsRequested: boolean;
    dikidiRequested: boolean;
    stripeRequested: boolean;
    yookassaRequested: boolean;
    prodamusRequested: boolean;
    paymentCopyRequested: boolean;
  },
) {
  const known =
    missingEmailColumn(message) ||
    missingWebhookColumn(message) ||
    missingAmoColumn(message) ||
    missingPipedriveColumn(message) ||
    missingBitrixColumn(message) ||
    missingYclientsColumn(message) ||
    missingDikidiColumn(message) ||
    missingPaymentColumn(message);
  if (!known) return null;
  const next: Record<string, unknown> = { ...payload };
  let changed = false;
  if (!requested.emailRequested) {
    delete next.notify_email_enabled;
    delete next.notify_email_address;
    changed = true;
  }
  if (!requested.webhookRequested) {
    delete next.webhook_url;
    delete next.webhook_secret;
    changed = true;
  }
  if (!requested.amoRequested) {
    delete next.amo_domain;
    delete next.amo_access_token;
    delete next.amo_pipeline_id;
    delete next.amo_handoff_status_id;
    changed = true;
  }
  if (!requested.pipedriveRequested) {
    delete next.pipedrive_api_token;
    delete next.pipedrive_pipeline_id;
    delete next.pipedrive_handoff_stage_id;
    changed = true;
  }
  if (!requested.bitrixRequested) {
    delete next.bitrix_webhook_url;
    delete next.bitrix_openline_id;
    delete next.bitrix_responsible_id;
    delete next.bitrix_handoff_status_id;
    changed = true;
  }
  if (!requested.yclientsRequested) {
    delete next.yclients_platform;
    delete next.yclients_company_id;
    delete next.yclients_partner_token;
    delete next.yclients_user_token;
    changed = true;
  }
  if (!requested.dikidiRequested) {
    delete next.dikidi_booking_url;
    changed = true;
  }
  if (!requested.stripeRequested) {
    delete next.stripe_secret_key;
    delete next.stripe_webhook_secret;
    delete next.stripe_currency;
    changed = true;
  }
  if (!requested.yookassaRequested) {
    delete next.yookassa_shop_id;
    delete next.yookassa_secret_key;
    changed = true;
  }
  if (!requested.prodamusRequested) {
    delete next.prodamus_shop_url;
    delete next.prodamus_secret_key;
    changed = true;
  }
  if (!requested.paymentCopyRequested) {
    delete next.payment_success_message;
    delete next.payment_return_url;
    changed = true;
  }
  return changed ? (next as T) : null;
}

function missingEmailColumn(message: string) {
  return message.includes("notify_email_enabled") || message.includes("notify_email_address");
}

function missingWebhookColumn(message: string) {
  return /(?<!bitrix_)webhook_url/.test(message) || /(?<!stripe_)webhook_secret/.test(message);
}

function missingPaymentColumn(message: string) {
  return message.includes("stripe_secret_key") || message.includes("stripe_webhook_secret") || message.includes("stripe_currency") || message.includes("yookassa_shop_id") || message.includes("yookassa_secret_key") || message.includes("prodamus_shop_url") || message.includes("prodamus_secret_key") || message.includes("payment_success_message") || message.includes("payment_return_url");
}

function missingAmoColumn(message: string) {
  return message.includes("amo_domain") || message.includes("amo_access_token") || message.includes("amo_pipeline_id") || message.includes("amo_handoff_status_id");
}

function missingPipedriveColumn(message: string) {
  return message.includes("pipedrive_api_token") || message.includes("pipedrive_pipeline_id") || message.includes("pipedrive_handoff_stage_id");
}

function missingBitrixColumn(message: string) {
  return message.includes("bitrix_webhook_url") || message.includes("bitrix_openline_id") || message.includes("bitrix_responsible_id") || message.includes("bitrix_handoff_status_id");
}

function missingYclientsColumn(message: string) {
  return message.includes("yclients_platform") || message.includes("yclients_company_id") || message.includes("yclients_partner_token") || message.includes("yclients_user_token");
}

function missingDikidiColumn(message: string) {
  return message.includes("dikidi_booking_url");
}

function columnError(message: string) {
  if (missingPaymentColumn(message)) return "Чтобы принимать оплаты, выполните миграцию 20261121_agent_payments.sql.";
  if (missingYclientsColumn(message) || missingDikidiColumn(message)) return "Чтобы подключить YCLIENTS или DIKIDI, выполните миграцию 20261121_agent_yclients_dikidi.sql.";
  if (missingBitrixColumn(message)) return "Чтобы подключить Битрикс24, выполните миграцию 20261121_agent_bitrix24.sql.";
  if (missingPipedriveColumn(message)) return "Чтобы подключить Pipedrive, выполните миграцию 20261121_agent_pipedrive.sql.";
  if (missingAmoColumn(message)) return "Чтобы подключить amoCRM, выполните миграцию 20261121_agent_amocrm.sql.";
  if (missingWebhookColumn(message)) return "Чтобы сохранять исходящий webhook, выполните миграцию 20261121_agent_outbound_webhook.sql.";
  if (missingEmailColumn(message)) return "Чтобы сохранять email для лидов, выполните миграцию 20261111_agent_notify_email.sql.";
  return message;
}

function failedSave(error: string): SaveState {
  return { ok: false, error, savedId: null, attemptId: crypto.randomUUID(), agentId: null, waPhoneNumber: null };
}

export async function deleteAgent(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const userId = await getEffectiveUserId();
  const { error } = await supabase.from("agents").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/agents");
}

/** Сохраняет порядок карточек после drag-and-drop: позиция агента = его индекс в переданном списке. */
export async function reorderAgents(ids: string[]): Promise<{ ok: boolean; error?: string }> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || ids.some((id) => typeof id !== "string" || !id)) {
    return { ok: false, error: "Некорректный порядок агентов." };
  }

  const supabase = createSupabaseAdminClient();
  const userId = await getEffectiveUserId();
  const results = await Promise.all(
    ids.map((id, index) => supabase.from("agents").update({ order_index: index }).eq("id", id).eq("user_id", userId)),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    const missing = failed.error.message.includes("order_index");
    return {
      ok: false,
      error: missing ? "Примените миграцию 20261104_agent_order.sql, чтобы порядок сохранялся." : failed.error.message,
    };
  }

  revalidatePath("/agents");
  return { ok: true };
}