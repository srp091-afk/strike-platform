"use server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  DEFAULT_SMM_STRATEGY,
  SMM_DAYS,
  SMM_TONES,
  maskSecret,
  type SmmIntegrationsState,
  type SmmKeyField,
  type SmmStrategyState,
} from "@/lib/smm-types";

/*
 * Все запросы идут через service_role только после getAuthenticatedUserId(),
 * и каждая выборка/запись жёстко фильтруется по user_id вошедшего пользователя.
 * Ключи API никогда не возвращаются в браузер в открытом виде: клиент получает только маску.
 */

export type SmmActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const KEY_COLUMNS: Record<SmmKeyField, "heygen_api_key" | "runway_api_key" | "elevenlabs_api_key"> = {
  heygen: "heygen_api_key",
  runway: "runway_api_key",
  elevenlabs: "elevenlabs_api_key",
};

const MAX_DESCRIPTION = 4000;
const MAX_KEY_LENGTH = 512;

function failure(error: unknown): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : "Не удалось выполнить действие." };
}

function readStrategy(row: Record<string, unknown> | null): SmmStrategyState {
  if (!row) return DEFAULT_SMM_STRATEGY;
  const schedule = (row.posting_schedule ?? {}) as { days?: unknown; time?: unknown };
  const days = Array.isArray(schedule.days)
    ? schedule.days.filter((day): day is string => typeof day === "string" && SMM_DAYS.includes(day as never))
    : DEFAULT_SMM_STRATEGY.days;
  const tone = SMM_TONES.includes(row.tone_of_voice as never) ? (row.tone_of_voice as string) : DEFAULT_SMM_STRATEGY.tone;
  return {
    description: typeof row.project_description === "string" ? row.project_description : "",
    tone,
    days,
    time: typeof schedule.time === "string" && /^\d{2}:\d{2}$/.test(schedule.time) ? schedule.time : DEFAULT_SMM_STRATEGY.time,
  };
}

export async function getSmmStrategy(): Promise<SmmActionResult<{ strategy: SmmStrategyState }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const { data, error } = await createSupabaseAdminClient()
      .from("smm_strategy")
      .select("project_description, tone_of_voice, posting_schedule")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, strategy: readStrategy(data) };
  } catch (error) {
    return failure(error);
  }
}

export async function saveSmmStrategy(input: SmmStrategyState): Promise<SmmActionResult<{ strategy: SmmStrategyState }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const description = String(input?.description ?? "").trim();
    if (description.length > MAX_DESCRIPTION) {
      return { ok: false, error: `Описание слишком длинное: максимум ${MAX_DESCRIPTION} символов.` };
    }
    if (!SMM_TONES.includes(input?.tone as never)) return { ok: false, error: "Выберите Tone of Voice." };
    const days = SMM_DAYS.filter((day) => Array.isArray(input?.days) && input.days.includes(day));
    if (days.length === 0) return { ok: false, error: "Выберите хотя бы один день публикации." };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(input?.time ?? ""))) return { ok: false, error: "Укажите время в формате ЧЧ:ММ." };

    const { error } = await createSupabaseAdminClient()
      .from("smm_strategy")
      .upsert(
        {
          user_id: userId,
          project_description: description,
          tone_of_voice: input.tone,
          posting_schedule: { days, time: input.time, posts_per_week: days.length },
        },
        { onConflict: "user_id" },
      );
    if (error) return { ok: false, error: error.message };
    return { ok: true, strategy: { description, tone: input.tone, days: [...days], time: input.time } };
  } catch (error) {
    return failure(error);
  }
}

export async function getSmmIntegrations(): Promise<SmmActionResult<{ integrations: SmmIntegrationsState }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const { data, error } = await createSupabaseAdminClient()
      .from("smm_integrations")
      .select("heygen_api_key, runway_api_key, elevenlabs_api_key, default_avatar_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false, error: error.message };
    return { ok: true, integrations: toState(data) };
  } catch (error) {
    return failure(error);
  }
}

function toState(row: Record<string, unknown> | null): SmmIntegrationsState {
  return {
    heygen: maskSecret(row?.heygen_api_key),
    runway: maskSecret(row?.runway_api_key),
    elevenlabs: maskSecret(row?.elevenlabs_api_key),
    avatarId: typeof row?.default_avatar_id === "string" ? row.default_avatar_id : "",
  };
}

/** Сохраняет один ключ (пустое значение не принимается: чтобы не стереть ключ случайно, используйте clearSmmKey). */
export async function saveSmmKey(field: SmmKeyField, value: string): Promise<SmmActionResult<{ integrations: SmmIntegrationsState }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const column = KEY_COLUMNS[field];
    if (!column) return { ok: false, error: "Неизвестный сервис." };
    const key = String(value ?? "").trim();
    if (!key) return { ok: false, error: "Введите API-ключ." };
    if (key.length > MAX_KEY_LENGTH) return { ok: false, error: "Ключ слишком длинный." };
    return await upsertIntegrations(userId, { [column]: key });
  } catch (error) {
    return failure(error);
  }
}

export async function clearSmmKey(field: SmmKeyField): Promise<SmmActionResult<{ integrations: SmmIntegrationsState }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const column = KEY_COLUMNS[field];
    if (!column) return { ok: false, error: "Неизвестный сервис." };
    return await upsertIntegrations(userId, { [column]: null });
  } catch (error) {
    return failure(error);
  }
}

export async function saveSmmAvatarId(value: string): Promise<SmmActionResult<{ integrations: SmmIntegrationsState }>> {
  try {
    const userId = await getAuthenticatedUserId();
    const avatarId = String(value ?? "").trim();
    if (avatarId.length > 200) return { ok: false, error: "ID аватара слишком длинный." };
    return await upsertIntegrations(userId, { default_avatar_id: avatarId || null });
  } catch (error) {
    return failure(error);
  }
}

async function upsertIntegrations(userId: string, patch: Record<string, string | null>) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("smm_integrations").upsert({ user_id: userId, ...patch }, { onConflict: "user_id" });
  if (error) return { ok: false as const, error: error.message };
  const { data, error: readError } = await supabase
    .from("smm_integrations")
    .select("heygen_api_key, runway_api_key, elevenlabs_api_key, default_avatar_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) return { ok: false as const, error: readError.message };
  return { ok: true as const, integrations: toState(data) };
}
