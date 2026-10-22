"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import {
  ensureGreenIncomingWebhook,
  getGreenAuthorizationCode,
  getGreenPhone,
  getGreenQr,
  getGreenState,
  greenInstanceAlreadyLogged,
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
  const userId = await getAuthenticatedUserId();
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
    if (qr.type === "alreadyLogged" || greenInstanceAlreadyLogged(qr.type, qr.message)) {
      return { ok: true as const, image: null, alreadyAuthorized: true, error: null };
    }
    if (qr.type === "qrCode" && qr.message) {
      return { ok: true as const, image: qr.message, alreadyAuthorized: false, error: null };
    }
    return await qrFailure(credentials);
  } catch {
    return qrFailure(credentials);
  }
}

async function qrFailure(credentials: GreenCredentials) {
  try {
    const state = await getGreenState(credentials);
    if (state === "authorized") {
      return { ok: true as const, image: null, alreadyAuthorized: true, error: null };
    }
  } catch {
    // The QR request already failed; the state check only distinguishes an authorized instance.
  }
  return { ok: false as const, image: null, alreadyAuthorized: false, error: "Не удалось получить QR-код." };
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

export async function saveWhatsAppPhone(agentId: string, phoneNumber: string) {
  if (!UUID_PATTERN.test(agentId)) return { ok: false as const, phone: null, error: "Сначала сохраните агента." };
  const digits = phoneNumber.replace(/@c\.us$/i, "").replace(/\D/g, "");
  if (!/^\d{8,15}$/.test(digits)) {
    return { ok: false as const, phone: null, error: "Введите номер в международном формате, например 79991234567." };
  }

  try {
    if (!(await agentInWorkspace(agentId))) return { ok: false as const, phone: null, error: "Агент не найден." };
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("agents").update({ wa_phone_number: digits }).eq("id", agentId);
    if (error) return { ok: false as const, phone: null, error: error.message };
    revalidatePath("/agents");
    return { ok: true as const, phone: digits, error: null };
  } catch (error) {
    return {
      ok: false as const,
      phone: null,
      error: error instanceof Error ? error.message : "Не удалось сохранить номер.",
    };
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

export type TelegramConnectInput =
  | { telegram_type: "bot"; telegram_bot_token: string }
  | {
      telegram_type: "userbot";
      telegram_phone: string;
      telegram_api_id: string;
      telegram_api_hash: string;
    };

export type TelegramConnectResult = {
  ok: boolean;
  error: string | null;
  telegram_type: "bot" | "userbot" | null;
  /** @username бота или номер телефона личного аккаунта. */
  label: string | null;
};

function telegramFailure(error: string): TelegramConnectResult {
  return { ok: false, error, telegram_type: null, label: null };
}

/** Токен ранее подключённого бота (для снятия вебхука при смене типа/токена). */
async function readExistingBotToken(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  agentId: string,
): Promise<string> {
  const { data } = await supabase
    .from("agents")
    .select("tg_bot_token, telegram_bot_token")
    .eq("id", agentId)
    .maybeSingle();
  const token = data?.telegram_bot_token ?? data?.tg_bot_token;
  return typeof token === "string" ? token : "";
}

export async function connectTelegramChannel(
  agentId: string,
  input: TelegramConnectInput,
): Promise<TelegramConnectResult> {
  if (!UUID_PATTERN.test(agentId)) return telegramFailure("Сначала сохраните агента.");

  try {
    if (!(await agentInWorkspace(agentId))) return telegramFailure("Агент не найден.");
    const supabase = createSupabaseAdminClient();
    const previousToken = await readExistingBotToken(supabase, agentId);

    if (input.telegram_type === "bot") {
      const token = input.telegram_bot_token.trim();
      if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
        return telegramFailure("Укажите токен бота из BotFather.");
      }
      const profile = await telegramGetMe(token);
      if (!profile.ok) return telegramFailure(profile.error);

      const { error } = await supabase
        .from("agents")
        .update({
          telegram_type: "bot",
          telegram_bot_token: token,
          telegram_phone: null,
          telegram_api_id: null,
          telegram_api_hash: null,
          // Зеркало для вебхука /api/webhooks/telegram/[token].
          tg_bot_token: token,
          tg_bot_username: profile.username,
          tg_is_active: true,
        })
        .eq("id", agentId);
      if (error) {
        if (error.code === "23505") return telegramFailure("Этот бот уже подключён к другому агенту.");
        return telegramFailure(hideToken(error.message, token));
      }

      if (previousToken && previousToken !== token) await telegramSetWebhook(previousToken, false);
      const hooked = await telegramSetWebhook(token, true);
      revalidatePath("/agents");
      if (!hooked.ok) return telegramFailure(hooked.error);
      return { ok: true, error: null, telegram_type: "bot", label: `@${profile.username}` };
    }

    // Личный аккаунт (userbot): сохраняем креды MTProto. Сам вход по коду
    // подтверждения выполняет внешний воркер при первом запуске сессии.
    const phone = input.telegram_phone.replace(/[\s()-]/g, "");
    if (!/^\+?\d{10,15}$/.test(phone)) {
      return telegramFailure("Введите номер телефона в международном формате, например +79991234567.");
    }
    const apiId = input.telegram_api_id.trim();
    if (!/^\d{1,20}$/.test(apiId)) {
      return telegramFailure("API ID — это число с my.telegram.org.");
    }
    const apiHash = input.telegram_api_hash.trim();
    if (!/^[0-9a-fA-F]{32}$/.test(apiHash)) {
      return telegramFailure("API Hash — это 32-символьная строка с my.telegram.org.");
    }

    const { error } = await supabase
      .from("agents")
      .update({
        telegram_type: "userbot",
        telegram_bot_token: null,
        telegram_phone: phone,
        telegram_api_id: apiId,
        telegram_api_hash: apiHash,
        tg_bot_token: null,
        tg_bot_username: null,
        tg_is_active: true,
      })
      .eq("id", agentId);
    if (error) {
      if (error.code === "23505") return telegramFailure("Этот аккаунт уже подключён к другому агенту.");
      return telegramFailure(error.message);
    }

    if (previousToken) await telegramSetWebhook(previousToken, false);
    revalidatePath("/agents");
    return { ok: true, error: null, telegram_type: "userbot", label: phone };
  } catch (error) {
    const token = input.telegram_type === "bot" ? input.telegram_bot_token.trim() : "";
    return telegramFailure(
      hideToken(error instanceof Error ? error.message : "Не удалось подключить Telegram.", token),
    );
  }
}

/** Обратная совместимость: подключение только бота по токену. */
export async function connectTelegram(agentId: string, botToken: string) {
  const result = await connectTelegramChannel(agentId, {
    telegram_type: "bot",
    telegram_bot_token: botToken,
  });
  return result.ok ? { ok: true as const, error: null } : { ok: false as const, error: result.error ?? "Не удалось подключить Telegram." };
}

export async function disconnectTelegram(agentId: string) {
  if (!UUID_PATTERN.test(agentId)) return { ok: false as const, error: "Агент не найден." };
  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getAuthenticatedUserId();
    const { data, error: lookupError } = await supabase
      .from("agents")
      .select("tg_bot_token, telegram_bot_token")
      .eq("id", agentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (lookupError) return { ok: false as const, error: lookupError.message };
    if (!data) return { ok: false as const, error: "Агент не найден." };

    const rawToken = data.telegram_bot_token ?? data.tg_bot_token;
    const token = typeof rawToken === "string" ? rawToken : "";
    if (token) await telegramSetWebhook(token, false);

    const { error } = await supabase
      .from("agents")
      .update({
        tg_bot_token: null,
        tg_bot_username: null,
        tg_is_active: false,
        telegram_type: "bot",
        telegram_bot_token: null,
        telegram_phone: null,
        telegram_api_id: null,
        telegram_api_hash: null,
      })
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
