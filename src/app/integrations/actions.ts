"use server";

import { revalidatePath } from "next/cache";

import { getWorkspaceUserId } from "@/lib/agents";
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

    const { data, error } = await supabase
      .from("whatsapp_accounts")
      .insert({
        phone_number: phoneNumber.slice(0, 40),
        instance_id: instanceId,
        api_token: apiToken,
        agent_id: agentId,
        is_active: true,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505") return { ...emptyState, error: "Этот Instance ID уже подключён." };
      if (error.message.includes("whatsapp_accounts")) {
        return { ...emptyState, error: "Сначала создайте таблицу whatsapp_accounts в Supabase." };
      }
      return { ...emptyState, error: error.message };
    }

    await upsertWhatsAppIntegration(supabase, userId, agentId, instanceId);
    revalidatePath("/integrations");
    return { ok: true, error: null, savedId: data.id as string };
  } catch (error) {
    return { ...emptyState, error: error instanceof Error ? error.message : "Не удалось сохранить номер." };
  }
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
