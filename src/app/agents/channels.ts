"use server";

import { revalidatePath } from "next/cache";

import { getWorkspaceUserId } from "@/lib/agents";
import {
  ensureGreenIncomingWebhook,
  getGreenAuthorizationCode,
  getGreenPhone,
  getGreenQr,
  getGreenState,
  type GreenCredentials,
} from "@/lib/green-api";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readGreenPair(instanceId: string, apiToken: string): GreenCredentials | null {
  const idInstance = instanceId.trim();
  const token = apiToken.trim();
  if (!/^\d{4,}$/.test(idInstance) || token.length < 8) return null;
  return { idInstance, apiToken: token };
}

async function agentInWorkspace(agentId: string) {
  const supabase = createSupabaseAdminClient();
  const userId = await getWorkspaceUserId();
  const { data, error } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
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
    return { ok: false as const, authorized: false, error: "Сначала сохраните агента." };
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

    const saved = await attachWhatsApp(input.agentId, {
      phoneNumber: phone,
      instanceId: credentials.idInstance,
      apiToken: credentials.apiToken,
    });
    return { ok: saved.ok, authorized: saved.ok, error: saved.error };
  } catch {
    return { ok: false as const, authorized: false, error: "Не удалось проверить статус WhatsApp." };
  }
}

export async function disconnectWhatsApp(agentId: string) {
  if (!UUID_PATTERN.test(agentId)) return { ok: false as const, error: "Агент не найден." };
  try {
    if (!(await agentInWorkspace(agentId))) return { ok: false as const, error: "Агент не найден." };
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("agents")
      .update({
        wa_instance_id: null,
        wa_api_token: null,
        wa_phone_number: null,
        wa_is_active: false,
      })
      .eq("id", agentId);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/agents");
    return { ok: true as const, error: null };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Не удалось отключить номер." };
  }
}

export async function connectTelegram(agentId: string, botToken: string) {
  if (!UUID_PATTERN.test(agentId)) return { ok: false as const, error: "Сначала сохраните агента." };
  const token = botToken.trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
    return { ok: false as const, error: "Укажите токен бота из BotFather." };
  }

  try {
    if (!(await agentInWorkspace(agentId))) return { ok: false as const, error: "Агент не найден." };
    const profile = await telegramGetMe(token);
    if (!profile.ok) return { ok: false as const, error: profile.error };

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("agents")
      .update({
        tg_bot_token: token,
        tg_bot_username: profile.username,
        tg_is_active: true,
      })
      .eq("id", agentId);
    if (error) {
      if (error.code === "23505") return { ok: false as const, error: "Этот бот уже подключён к другому агенту." };
      return { ok: false as const, error: hideToken(error.message, token) };
    }

    const hooked = await telegramSetWebhook(token, true);
    revalidatePath("/agents");
    if (!hooked.ok) return { ok: false as const, error: hooked.error };
    return { ok: true as const, error: null };
  } catch (error) {
    return {
      ok: false as const,
      error: hideToken(error instanceof Error ? error.message : "Не удалось подключить Telegram.", token),
    };
  }
}

export async function disconnectTelegram(agentId: string) {
  if (!UUID_PATTERN.test(agentId)) return { ok: false as const, error: "Агент не найден." };
  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getWorkspaceUserId();
    const { data, error: lookupError } = await supabase
      .from("agents")
      .select("tg_bot_token")
      .eq("id", agentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (lookupError) return { ok: false as const, error: lookupError.message };
    if (!data) return { ok: false as const, error: "Агент не найден." };

    const token = typeof data.tg_bot_token === "string" ? data.tg_bot_token : "";
    if (token) await telegramSetWebhook(token, false);

    const { error } = await supabase
      .from("agents")
      .update({ tg_bot_token: null, tg_bot_username: null, tg_is_active: false })
      .eq("id", agentId);
    if (error) return { ok: false as const, error: error.message };
    revalidatePath("/agents");
    return { ok: true as const, error: null };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Не удалось отключить Telegram." };
  }
}

async function attachWhatsApp(
  agentId: string,
  input: { phoneNumber: string; instanceId: string; apiToken: string },
) {
  if (!(await agentInWorkspace(agentId))) return { ok: false as const, error: "Агент не найден." };
  const supabase = createSupabaseAdminClient();
  const { data: taken, error: takenError } = await supabase
    .from("agents")
    .select("id")
    .eq("wa_instance_id", input.instanceId)
    .neq("id", agentId)
    .maybeSingle();
  if (takenError) return { ok: false as const, error: takenError.message };
  if (taken) return { ok: false as const, error: "Этот номер уже подключён к другому агенту." };

  const { error } = await supabase
    .from("agents")
    .update({
      wa_instance_id: input.instanceId,
      wa_api_token: input.apiToken,
      wa_phone_number: input.phoneNumber.slice(0, 40),
      wa_is_active: true,
    })
    .eq("id", agentId);
  if (error) {
    if (error.code === "23505") return { ok: false as const, error: "Этот номер уже подключён к другому агенту." };
    return { ok: false as const, error: error.message };
  }

  try {
    await ensureGreenIncomingWebhook({
      idInstance: input.instanceId,
      apiToken: input.apiToken,
    });
  } catch {
    return { ok: false as const, error: "Номер сохранён, но не удалось включить вебхук WhatsApp." };
  }

  revalidatePath("/agents");
  return { ok: true as const, error: null };
}

async function telegramGetMe(token: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
    signal: AbortSignal.timeout(15000),
  });
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    result?: { username?: string };
    description?: string;
  } | null;
  const username = payload?.result?.username?.trim() ?? "";
  if (!response.ok || !payload?.ok || !username) {
    return { ok: false as const, error: "Telegram не принял токен бота.", username: "" };
  }
  return { ok: true as const, error: null, username };
}

async function telegramSetWebhook(token: string, enabled: boolean) {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://strike-platform.vercel.app").replace(/\/$/, "");
  const url = enabled ? `${origin}/api/webhooks/telegram/${encodeURIComponent(token)}` : "";
  const response = await fetch(`https://api.telegram.org/bot${token}/${enabled ? "setWebhook" : "deleteWebhook"}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(enabled ? { url } : {}),
    signal: AbortSignal.timeout(15000),
  });
  const payload = (await response.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
  if (!response.ok || payload?.ok === false) {
    return { ok: false as const, error: hideToken(payload?.description || "Не удалось обновить вебхук Telegram.", token) };
  }
  return { ok: true as const, error: null };
}

function hideToken(message: string, token: string) {
  return token ? message.split(token).join("…") : message;
}
