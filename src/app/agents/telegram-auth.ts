"use server";

import { revalidatePath } from "next/cache";
import { Api, TelegramClient } from "telegram";
import { computeCheck } from "telegram/Password";
import { StringSession } from "telegram/sessions";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SendTelegramCodeResult = {
  ok: boolean;
  error: string | null;
  phoneCodeHash: string | null;
  /**
   * Промежуточная (ещё не авторизованная) StringSession с auth key, на котором
   * был запрошен код. Её нужно вернуть обратно в signInTelegram: phoneCodeHash
   * действителен только для этого auth key, а Server Actions стейтлесс.
   */
  session: string | null;
  isCodeViaApp: boolean;
};

export type SignInTelegramResult = {
  ok: boolean;
  error: string | null;
  /** Telegram требует облачный пароль (2FA), а пароль не был передан. */
  needsPassword: boolean;
  /** Актуальная промежуточная сессия (для повторной попытки с паролем). */
  session: string | null;
  /** Номер телефона при успешном входе. */
  label: string | null;
};

function normalizePhone(value: string) {
  return value.replace(/[\s()-]/g, "");
}

function readApiId(value: string | number): number | null {
  const text = String(value).trim();
  if (!/^\d{1,20}$/.test(text)) return null;
  const apiId = Number(text);
  return Number.isSafeInteger(apiId) && apiId > 0 ? apiId : null;
}

function validateCredentials(apiId: string | number, apiHash: string, phone: string) {
  const normalizedPhone = normalizePhone(phone);
  if (!/^\+?\d{10,15}$/.test(normalizedPhone)) {
    return { ok: false as const, error: "Введите номер телефона в международном формате, например +79991234567." };
  }
  const numericApiId = readApiId(apiId);
  if (numericApiId === null) return { ok: false as const, error: "API ID — это число с my.telegram.org." };
  const hash = apiHash.trim();
  if (!/^[0-9a-fA-F]{32}$/.test(hash)) {
    return { ok: false as const, error: "API Hash — это 32-символьная строка с my.telegram.org." };
  }
  return { ok: true as const, phone: normalizedPhone, apiId: numericApiId, apiHash: hash };
}

/** Код RPC-ошибки GramJS (SESSION_PASSWORD_NEEDED, PHONE_CODE_INVALID, ...). */
function rpcCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const record = error as { errorMessage?: unknown; message?: unknown };
  const text = typeof record.errorMessage === "string" ? record.errorMessage : typeof record.message === "string" ? record.message : "";
  return text.toUpperCase();
}

function friendlyError(error: unknown, apiHash: string): string {
  const code = rpcCode(error);
  if (code.includes("PHONE_NUMBER_INVALID")) return "Telegram отклонил номер телефона.";
  if (code.includes("PHONE_CODE_INVALID")) return "Неверный код из Telegram.";
  if (code.includes("PHONE_CODE_EXPIRED")) return "Код истёк. Запросите новый код.";
  if (code.includes("PHONE_CODE_EMPTY")) return "Введите код из Telegram.";
  if (code.includes("PASSWORD_HASH_INVALID")) return "Неверный облачный пароль (2FA).";
  if (code.includes("API_ID_INVALID") || code.includes("API_ID_PUBLISHED_FLOOD")) {
    return "Telegram отклонил API ID / API Hash.";
  }
  if (code.includes("FLOOD_WAIT")) return "Слишком много попыток. Telegram просит подождать перед следующим запросом.";
  if (code.includes("PHONE_NUMBER_BANNED")) return "Этот номер заблокирован в Telegram.";
  const raw = error instanceof Error ? error.message : "Не удалось выполнить запрос к Telegram.";
  // Никогда не утекаем секреты в текст ошибки.
  return apiHash ? raw.split(apiHash).join("…") : raw;
}

function createClient(apiId: number, apiHash: string, session: string) {
  return new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 5 });
}

function saveSession(client: TelegramClient): string {
  return client.session.save() as unknown as string;
}

async function closeClient(client: TelegramClient) {
  try {
    await client.disconnect();
  } catch {
    // Соединение могло не открыться; disconnect в finally не должен маскировать результат.
  }
}

async function agentInWorkspace(agentId: string) {
  const supabase = createSupabaseAdminClient();
  const userId = await getAuthenticatedUserId();
  const { data, error } = await supabase
    .from("agents")
    .select("id, tg_bot_token, telegram_bot_token")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Шаг 1 MTProto-входа: отправка кода подтверждения на телефон.
 * Реальный API GramJS 2.x: client.sendCode({ apiId, apiHash }, phone)
 * (не client.sendCode(phone), как в упрощённых примерах).
 */
export async function sendTelegramCode(
  apiId: string | number,
  apiHash: string,
  phone: string,
): Promise<SendTelegramCodeResult> {
  const credentials = validateCredentials(apiId, apiHash, phone);
  if (!credentials.ok) {
    return { ok: false, error: credentials.error, phoneCodeHash: null, session: null, isCodeViaApp: false };
  }

  const client = createClient(credentials.apiId, credentials.apiHash, "");
  try {
    await client.connect();
    const sent = await client.sendCode(
      { apiId: credentials.apiId, apiHash: credentials.apiHash },
      credentials.phone,
    );
    return {
      ok: true,
      error: null,
      phoneCodeHash: sent.phoneCodeHash,
      session: saveSession(client),
      isCodeViaApp: sent.isCodeViaApp,
    };
  } catch (error) {
    return {
      ok: false,
      error: friendlyError(error, credentials.apiHash),
      phoneCodeHash: null,
      session: null,
      isCodeViaApp: false,
    };
  } finally {
    await closeClient(client);
  }
}

/**
 * Шаг 2 MTProto-входа: проверка кода (+ облачный пароль при 2FA) и сохранение сессии.
 * Реальный API GramJS 2.x не имеет client.signIn(phone, { code }): вход выполняется
 * через Api.auth.SignIn / Api.auth.CheckPassword на том же auth key (см. session).
 */
export async function signInTelegram(
  agentId: string,
  apiId: string | number,
  apiHash: string,
  phone: string,
  phoneCodeHash: string,
  code: string,
  password?: string,
  session?: string,
): Promise<SignInTelegramResult> {
  if (!UUID_PATTERN.test(agentId)) {
    return { ok: false, error: "Сначала сохраните агента.", needsPassword: false, session: null, label: null };
  }
  const credentials = validateCredentials(apiId, apiHash, phone);
  if (!credentials.ok) {
    return { ok: false, error: credentials.error, needsPassword: false, session: null, label: null };
  }
  const hash = phoneCodeHash.trim();
  if (!hash) return { ok: false, error: "Сначала запросите код.", needsPassword: false, session: null, label: null };
  const phoneCode = code.replace(/\D/g, "");
  if (!/^\d{4,8}$/.test(phoneCode)) {
    return { ok: false, error: "Введите код из Telegram.", needsPassword: false, session: null, label: null };
  }

  const client = createClient(credentials.apiId, credentials.apiHash, session?.trim() ?? "");
  try {
    const agent = await agentInWorkspace(agentId);
    if (!agent) return { ok: false, error: "Агент не найден.", needsPassword: false, session: null, label: null };

    await client.connect();

    try {
      const result = await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: credentials.phone,
          phoneCodeHash: hash,
          phoneCode,
        }),
      );
      if (result instanceof Api.auth.AuthorizationSignUpRequired) {
        return {
          ok: false,
          error: "Этот номер не зарегистрирован в Telegram. Сначала создайте аккаунт в приложении Telegram.",
          needsPassword: false,
          session: saveSession(client),
          label: null,
        };
      }
    } catch (error) {
      if (!rpcCode(error).includes("SESSION_PASSWORD_NEEDED")) throw error;

      // 2FA: код уже принят, Telegram требует облачный пароль.
      const trimmedPassword = password?.trim() ?? "";
      if (!trimmedPassword) {
        return { ok: false, error: null, needsPassword: true, session: saveSession(client), label: null };
      }
      const passwordInfo = await client.invoke(new Api.account.GetPassword());
      const passwordCheck = await computeCheck(passwordInfo, trimmedPassword);
      await client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));
    }

    const telegramSession = saveSession(client);
    if (!telegramSession) throw new Error("Telegram не вернул сессию.");

    // Если у агента раньше был бот — снимаем его вебхук, канал становится userbot.
    const previousToken =
      typeof agent.telegram_bot_token === "string" && agent.telegram_bot_token
        ? agent.telegram_bot_token
        : typeof agent.tg_bot_token === "string"
          ? agent.tg_bot_token
          : "";
    if (previousToken) {
      await fetch(`https://api.telegram.org/bot${previousToken}/deleteWebhook`, {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("agents")
      .update({
        telegram_type: "userbot",
        telegram_bot_token: null,
        telegram_phone: credentials.phone,
        telegram_api_id: String(credentials.apiId),
        telegram_api_hash: credentials.apiHash,
        telegram_session: telegramSession,
        tg_bot_token: null,
        tg_bot_username: null,
        tg_is_active: true,
      })
      .eq("id", agentId);
    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          error: "Этот аккаунт уже подключён к другому агенту.",
          needsPassword: false,
          session: saveSession(client),
          label: null,
        };
      }
      return { ok: false, error: error.message, needsPassword: false, session: saveSession(client), label: null };
    }

    revalidatePath("/agents");
    return { ok: true, error: null, needsPassword: false, session: null, label: credentials.phone };
  } catch (error) {
    return {
      ok: false,
      error: friendlyError(error, credentials.apiHash),
      needsPassword: false,
      session: null,
      label: null,
    };
  } finally {
    await closeClient(client);
  }
}
