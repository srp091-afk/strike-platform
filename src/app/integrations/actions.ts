"use server";

import { revalidatePath } from "next/cache";

import { getWorkspaceUserId } from "@/lib/agents";
import {
  getGreenAuthorizationCode,
  getGreenPhone,
  getGreenQr,
  getGreenState,
  type GreenCredentials,
} from "@/lib/green-api";
import {
  integrationDefinition,
  isIntegrationProvider,
  type IntegrationProvider,
} from "@/lib/integration-catalog";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SaveIntegrationState = {
  ok: boolean;
  error: string | null;
  savedId: string | null;
};

const emptyState: SaveIntegrationState = { ok: false, error: null, savedId: null };

export async function saveIntegration(
  _prev: SaveIntegrationState,
  formData: FormData,
): Promise<SaveIntegrationState> {
  const provider = String(formData.get("provider") ?? "");
  const agentId = String(formData.get("agent_id") ?? "").trim();
  const active = String(formData.get("intent") ?? "save") !== "disable";

  if (!isIntegrationProvider(provider)) {
    return { ...emptyState, error: "Неизвестный канал." };
  }

  if (!UUID_PATTERN.test(agentId)) {
    return { ...emptyState, error: "Выберите агента для этого канала." };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getWorkspaceUserId();
    const agentOk = await agentBelongsToWorkspace(supabase, userId, agentId);
    if (!agentOk) {
      return { ...emptyState, error: "Агент не найден." };
    }

    const definition = integrationDefinition(provider);
    const existing = await findIntegration(supabase, userId, provider);
    const previous = existing ? await readCredentials(supabase, existing.id) : {};
    const next = { ...previous };
    const invalid = collectCredentials(formData, definition.fields, next);
    if (invalid) {
      return { ...emptyState, error: invalid };
    }

    if (active) {
      const missing = definition.fields.find((field) => !next[field.name]);
      if (missing) {
        return { ...emptyState, error: `Укажите ${missing.label}.` };
      }
    }

    const status = active ? "connected" : "disconnected";
    const integrationId = existing
      ? await updateIntegration(supabase, existing.id, userId, agentId, definition.title, status)
      : await insertIntegration(supabase, userId, agentId, provider, definition.title, status);

    if (!integrationId) {
      return { ...emptyState, error: "Не удалось сохранить канал." };
    }

    const { error: secretError } = await supabase.from("integration_secrets").upsert({
      integration_id: integrationId,
      credentials: next,
    });

    if (secretError) {
      return { ...emptyState, error: secretError.message };
    }

    revalidatePath("/");
    revalidatePath("/integrations");
    return { ok: true, error: null, savedId: crypto.randomUUID() };
  } catch (error) {
    return {
      ...emptyState,
      error: error instanceof Error ? error.message : "Не удалось сохранить интеграцию.",
    };
  }
}

export async function assignIntegrationAgent(integrationId: string, agentId: string) {
  if (!UUID_PATTERN.test(integrationId) || !UUID_PATTERN.test(agentId)) {
    return { ok: false, error: "Выберите агента из списка." };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getWorkspaceUserId();
    const agentOk = await agentBelongsToWorkspace(supabase, userId, agentId);
    if (!agentOk) {
      return { ok: false, error: "Агент не найден." };
    }

    const { data, error } = await supabase
      .from("integrations")
      .update({ agent_id: agentId })
      .eq("id", integrationId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) {
      return { ok: false, error: error.message };
    }

    if (!data) {
      return { ok: false, error: "Канал не найден." };
    }

    revalidatePath("/integrations");
    return { ok: true, error: null };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось назначить агента.",
    };
  }
}

function collectCredentials(
  formData: FormData,
  fields: readonly { name: string; label: string }[],
  target: Record<string, string>,
) {
  for (const field of fields) {
    const value = String(formData.get(field.name) ?? "").trim();
    if (!value) continue;
    if (value.length > 4000) {
      return `${field.label} слишком длинное.`;
    }
    target[field.name] = value;
  }
  return null;
}

async function agentBelongsToWorkspace(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  agentId: string,
) {
  const { data, error } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
}

async function findIntegration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  provider: IntegrationProvider,
) {
  const { data, error } = await supabase
    .from("integrations")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? { id: data.id as string } : null;
}

async function readCredentials(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  integrationId: string,
) {
  const { data, error } = await supabase
    .from("integration_secrets")
    .select("credentials")
    .eq("integration_id", integrationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const record =
    data?.credentials && typeof data.credentials === "object" && !Array.isArray(data.credentials)
      ? (data.credentials as Record<string, unknown>)
      : {};
  const credentials: Record<string, string> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "string" && value.trim()) credentials[key] = value.trim();
  }

  return credentials;
}

async function updateIntegration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  id: string,
  userId: string,
  agentId: string,
  name: string,
  status: "connected" | "disconnected",
) {
  const { data, error } = await supabase
    .from("integrations")
    .update({ agent_id: agentId, name, status })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data?.id as string | undefined) ?? null;
}

async function insertIntegration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  agentId: string,
  provider: IntegrationProvider,
  name: string,
  status: "connected" | "disconnected",
) {
  const { data, error } = await supabase
    .from("integrations")
    .insert({
      user_id: userId,
      agent_id: agentId,
      provider,
      name,
      status,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id as string;
}

export async function saveWhatsAppAccount(
  _prev: SaveIntegrationState,
  formData: FormData,
): Promise<SaveIntegrationState> {
  const phoneNumber = String(formData.get("phone_number") ?? "").trim();
  const instanceId = String(formData.get("instance_id") ?? "").trim();
  const apiToken = String(formData.get("api_token") ?? "").trim();
  const agentId = String(formData.get("agent_id") ?? "").trim();

  if (!phoneNumber) return { ...emptyState, error: "Укажите номер телефона." };
  if (!/^\d{4,}$/.test(instanceId)) return { ...emptyState, error: "Instance ID должен состоять из цифр." };
  if (apiToken.length < 8) return { ...emptyState, error: "Укажите API Token." };
  if (!UUID_PATTERN.test(agentId)) return { ...emptyState, error: "Выберите агента." };

  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getWorkspaceUserId();
    const agentOk = await agentBelongsToWorkspace(supabase, userId, agentId);
    if (!agentOk) return { ...emptyState, error: "Агент не найден." };

    return persistWhatsAppAccount(supabase, userId, {
      phoneNumber,
      instanceId,
      apiToken,
      agentId,
    });
  } catch (error) {
    return { ...emptyState, error: error instanceof Error ? error.message : "Не удалось сохранить номер." };
  }
}

function readGreenPair(instanceId: string, apiToken: string): GreenCredentials | null {
  const idInstance = instanceId.trim();
  const token = apiToken.trim();
  if (!/^\d{4,}$/.test(idInstance) || token.length < 8) return null;
  return { idInstance, apiToken: token };
}

export async function requestWhatsAppQr(instanceId: string, apiToken: string) {
  const credentials = readGreenPair(instanceId, apiToken);
  if (!credentials) {
    return { ok: false as const, image: null, alreadyAuthorized: false, error: "Укажите Instance ID и API Token." };
  }

  try {
    const qr = await getGreenQr(credentials);
    if (qr.type === "alreadyLogged") {
      return { ok: true as const, image: null, alreadyAuthorized: true, error: null };
    }
    if (qr.type === "qrCode" && qr.message) {
      return { ok: true as const, image: qr.message, alreadyAuthorized: false, error: null };
    }
    return { ok: false as const, image: null, alreadyAuthorized: false, error: "Не удалось получить QR-код." };
  } catch {
    return { ok: false as const, image: null, alreadyAuthorized: false, error: "Не удалось получить QR-код." };
  }
}

export async function requestWhatsAppLinkCode(instanceId: string, apiToken: string, phoneNumber: string) {
  const credentials = readGreenPair(instanceId, apiToken);
  const digits = phoneNumber.replace(/\D/g, "");
  if (!credentials) {
    return { ok: false as const, code: null, error: "Укажите Instance ID и API Token." };
  }
  if (!/^\d{8,15}$/.test(digits)) {
    return {
      ok: false as const,
      code: null,
      error: "Введите номер в международном формате, например 79991234567.",
    };
  }

  try {
    const code = await getGreenAuthorizationCode(credentials, digits);
    return { ok: true as const, code, error: null };
  } catch {
    return { ok: false as const, code: null, error: "Не удалось получить код связывания." };
  }
}

export async function confirmWhatsAppAuthorization(input: {
  instanceId: string;
  apiToken: string;
  agentId: string;
  phoneNumber: string;
}) {
  const credentials = readGreenPair(input.instanceId, input.apiToken);
  if (!credentials) {
    return { ok: false as const, authorized: false, error: "Укажите Instance ID и API Token." };
  }
  if (!UUID_PATTERN.test(input.agentId)) {
    return { ok: false as const, authorized: false, error: "Выберите агента." };
  }

  try {
    const state = await getGreenState(credentials);
    if (state !== "authorized") {
      return { ok: true as const, authorized: false, error: null };
    }

    let phone = "";
    try {
      phone = await getGreenPhone(credentials);
    } catch {
      phone = "";
    }
    if (!phone) phone = input.phoneNumber.replace(/\D/g, "");
    if (!phone) {
      return { ok: false as const, authorized: true, error: "Не удалось определить номер телефона." };
    }

    const supabase = createSupabaseAdminClient();
    const userId = await getWorkspaceUserId();
    const saved = await persistWhatsAppAccount(supabase, userId, {
      phoneNumber: phone,
      instanceId: credentials.idInstance,
      apiToken: credentials.apiToken,
      agentId: input.agentId,
    });
    return { ok: saved.ok, authorized: saved.ok, error: saved.error };
  } catch {
    return { ok: false as const, authorized: false, error: "Не удалось проверить статус WhatsApp." };
  }
}

export async function deleteWhatsAppAccount(accountId: string) {
  if (!UUID_PATTERN.test(accountId)) {
    return { ok: false as const, error: "Номер не найден." };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getWorkspaceUserId();
    const { data, error: lookupError } = await supabase
      .from("whatsapp_accounts")
      .select("id, instance_id")
      .eq("id", accountId)
      .maybeSingle();

    if (lookupError) return { ok: false as const, error: lookupError.message };
    if (!data) return { ok: false as const, error: "Номер не найден." };

    const { error } = await supabase.from("whatsapp_accounts").delete().eq("id", accountId);
    if (error) return { ok: false as const, error: error.message };

    if (data.instance_id) {
      await supabase
        .from("integrations")
        .update({ status: "disconnected" })
        .eq("user_id", userId)
        .eq("provider", "whatsapp")
        .eq("external_id", String(data.instance_id));
    }

    revalidatePath("/integrations");
    return { ok: true as const, error: null };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Не удалось удалить номер." };
  }
}

async function persistWhatsAppAccount(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  input: { phoneNumber: string; instanceId: string; apiToken: string; agentId: string },
): Promise<SaveIntegrationState> {
  const agentOk = await agentBelongsToWorkspace(supabase, userId, input.agentId);
  if (!agentOk) return { ...emptyState, error: "Агент не найден." };

  const row = {
    phone_number: input.phoneNumber.slice(0, 40),
    instance_id: input.instanceId,
    api_token: input.apiToken,
    agent_id: input.agentId,
    is_active: true,
  };

  const inserted = await supabase.from("whatsapp_accounts").insert(row).select("id").single();
  let savedId = inserted.data?.id as string | undefined;

  if (inserted.error) {
    if (inserted.error.message.includes("whatsapp_accounts")) {
      return { ...emptyState, error: "Сначала создайте таблицу whatsapp_accounts в Supabase." };
    }
    if (inserted.error.code !== "23505") {
      return { ...emptyState, error: inserted.error.message };
    }

    const updated = await supabase
      .from("whatsapp_accounts")
      .update({
        phone_number: row.phone_number,
        api_token: row.api_token,
        agent_id: row.agent_id,
        is_active: true,
      })
      .eq("instance_id", input.instanceId)
      .select("id")
      .maybeSingle();

    if (updated.error || !updated.data) {
      return { ...emptyState, error: updated.error?.message ?? "Не удалось обновить номер." };
    }
    savedId = updated.data.id as string;
  }

  await upsertWhatsAppIntegration(supabase, userId, input.agentId, input.instanceId);
  revalidatePath("/integrations");
  return { ok: true, error: null, savedId: savedId ?? null };
}

export async function assignWhatsAppAccountAgent(accountId: string, agentId: string) {
  if (!UUID_PATTERN.test(accountId) || !UUID_PATTERN.test(agentId)) {
    return { ok: false as const, error: "Некорректные данные." };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getWorkspaceUserId();
    const agentOk = await agentBelongsToWorkspace(supabase, userId, agentId);
    if (!agentOk) return { ok: false as const, error: "Агент не найден." };

    const { data, error } = await supabase
      .from("whatsapp_accounts")
      .update({ agent_id: agentId })
      .eq("id", accountId)
      .select("instance_id")
      .maybeSingle();

    if (error) return { ok: false as const, error: error.message };
    if (!data) return { ok: false as const, error: "Номер не найден." };

    await upsertWhatsAppIntegration(supabase, userId, agentId, String(data.instance_id));
    revalidatePath("/integrations");
    return { ok: true as const, error: null };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Не удалось сменить агента." };
  }
}

async function upsertWhatsAppIntegration(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  agentId: string,
  instanceId: string,
) {
  const { data: existing, error: lookupError } = await supabase
    .from("integrations")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", "whatsapp")
    .eq("external_id", instanceId)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);

  if (existing?.id) {
    const { error } = await supabase
      .from("integrations")
      .update({ agent_id: agentId, status: "connected", name: "WhatsApp Business" })
      .eq("id", existing.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("integrations").insert({
    user_id: userId,
    agent_id: agentId,
    provider: "whatsapp",
    name: "WhatsApp Business",
    status: "connected",
    external_id: instanceId,
  });
  if (error) throw new Error(error.message);
}
