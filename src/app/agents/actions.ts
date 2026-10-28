"use server";

import { revalidatePath } from "next/cache";

import {
  DEFAULT_ACTIVE_CHANNELS,
  isAgentModel,
  readHandoffDuration,
  readMessageLimit,
  readResponseDelay,
  readSplitMessages,
  type ActiveChannels,
  type HandoffDuration,
} from "@/lib/agent-models";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getGreenPhone } from "@/lib/green-api";
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
  const responseDelay = readDelay(formData.get("response_delay"));
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

  if (!name) {
    return { ok: false as const, error: "Укажи имя агента." };
  }

  if (!systemPrompt) {
    return { ok: false as const, error: "Нужна системная инструкция." };
  }

  if (!isAgentModel(model)) {
    return { ok: false as const, error: "Выбери модель из списка." };
  }

  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return { ok: false as const, error: "Температура должна быть от 0 до 2." };
  }

  if (responseDelay === null) {
    return { ok: false as const, error: "Задержка должна быть не меньше 0 секунд." };
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

  if (followupInterval === null || followupMaxCount === null) {
    return {
      ok: false as const,
      error: "Интервал напоминаний — целое число часов от 1, лимит напоминаний — целое число от 0.",
    };
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
    responseDelay,
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
  };
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

function readDelay(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return 0;
  const delay = Number(value);
  if (!Number.isFinite(delay) || delay < 0) return null;
  return readResponseDelay(delay);
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
    const userId = await getAuthenticatedUserId();
    const manualPhone = /^\d{8,15}$/.test(fields.waPhoneNumber) ? fields.waPhoneNumber : null;
    const waPhoneNumber = (await readWhatsAppPhone(fields.waInstanceId, fields.waApiToken)) || manualPhone;
    const payload = {
      name: fields.name,
      system_prompt: fields.systemPrompt,
      model: fields.model,
      temperature: fields.temperature,
      response_delay: fields.responseDelay,
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

    let agentId = fields.id;
    if (fields.id) {
      const { data, error } = await supabase
        .from("agents")
        .update(payload)
        .eq("id", fields.id)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();

      if (error) {
        return failedSave(error.message);
      }

      if (!data) {
        return failedSave("Агент не найден.");
      }
    } else {
      const { data, error } = await supabase.from("agents").insert(payload).select("id").single();
      if (error || !data) {
        return failedSave(error?.message ?? "Не удалось сохранить агента.");
      }
      agentId = String(data.id);
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

function failedSave(error: string): SaveState {
  return { ok: false, error, savedId: null, attemptId: crypto.randomUUID(), agentId: null, waPhoneNumber: null };
}

export async function deleteAgent(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const userId = await getAuthenticatedUserId();
  const { error } = await supabase.from("agents").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/agents");
}
