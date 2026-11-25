"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId, type NotificationSettings } from "@/lib/auth-user";
import { readTimeZone } from "@/lib/outreach-schedule";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export type NameState = {
  ok: boolean;
  error: string | null;
  savedName: string | null;
};

export async function updateDisplayName(_prev: NameState, formData: FormData): Promise<NameState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) {
    return { ok: false, error: "Введите имя.", savedName: null };
  }
  if (displayName.length > 80) {
    return { ok: false, error: "Имя не длиннее 80 символов.", savedName: null };
  }

  try {
    const userId = await getAuthenticatedUserId();
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("profiles").update({ full_name: displayName }).eq("id", userId);
    if (error) {
      return { ok: false, error: error.message, savedName: null };
    }
    const metadata = await supabase.auth.admin.updateUserById(userId, { user_metadata: { full_name: displayName } });
    if (metadata.error) {
      return { ok: false, error: metadata.error.message, savedName: null };
    }

    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { ok: true, error: null, savedName: displayName };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось сохранить имя.",
      savedName: null,
    };
  }
}

export type NoticeState = {
  ok: boolean;
  error: string | null;
  notice: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const savedNotice: NoticeState = { ok: false, error: null, notice: null };

export async function requestEmailChange(_prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const nextEmail = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_PATTERN.test(nextEmail) || nextEmail.length > 254) {
    return { ...savedNotice, error: "Введите корректный email." };
  }

  try {
    const session = await signedInClient();
    if (!session) return { ...savedNotice, error: "Нужно войти в аккаунт." };
    if (session.user.email?.trim().toLowerCase() === nextEmail) {
      return { ...savedNotice, error: "Это уже текущая почта." };
    }
    const redirectTo = `${appOrigin()}/auth/confirm?next=/settings`;
    const { error } = await session.supabase.auth.updateUser({ email: nextEmail }, { emailRedirectTo: redirectTo });
    if (error) return { ...savedNotice, error: authMessage(error.message) };
    revalidatePath("/settings");
    return {
      ok: true,
      error: null,
      notice:
        "Письмо для подтверждения отправлено на новый адрес. Если Supabase просит подтвердить смену и со старой почты, проверьте оба ящика. Адрес в аккаунте обновится после перехода по ссылке.",
    };
  } catch (error) {
    return { ...savedNotice, error: error instanceof Error ? error.message : "Не удалось сменить почту." };
  }
}

export async function updatePassword(_prev: NoticeState, formData: FormData): Promise<NoticeState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { ...savedNotice, error: "Пароль должен быть не короче 8 символов." };
  if (password.length > 72) return { ...savedNotice, error: "Пароль не длиннее 72 символов." };
  if (password !== confirm) return { ...savedNotice, error: "Пароли не совпадают." };

  try {
    const session = await signedInClient();
    if (!session) return { ...savedNotice, error: "Нужно войти в аккаунт." };
    const { error } = await session.supabase.auth.updateUser({ password });
    if (error) return { ...savedNotice, error: authMessage(error.message) };
    revalidatePath("/settings");
    return { ok: true, error: null, notice: "Пароль сохранён. Теперь можно входить по email и паролю." };
  } catch (error) {
    return { ...savedNotice, error: error instanceof Error ? error.message : "Не удалось сохранить пароль." };
  }
}

export async function saveWorkspace(
  _prev: NoticeState,
  formData: FormData,
): Promise<NoticeState> {
  const notifications: NotificationSettings = {
    lowBalance: formData.get("low_balance") === "on",
    subscription: formData.get("subscription") === "on",
    channelAlerts: formData.get("channel_alerts") === "on",
  };
  const requested = String(formData.get("timezone") ?? "").trim();
  const timezone = readTimeZone(requested);
  if (!requested || timezone !== requested) {
    return { ...savedNotice, error: "Выберите часовой пояс из списка." };
  }

  try {
    const userId = await getAuthenticatedUserId();
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("profiles")
      .update({
        notification_settings: {
          low_balance: notifications.lowBalance,
          subscription: notifications.subscription,
          channel_alerts: notifications.channelAlerts,
        },
        timezone,
      })
      .eq("id", userId);
    if (error) {
      const missing = /notification_settings|timezone/.test(error.message);
      return {
        ...savedNotice,
        error: missing ? "Примените миграцию 20261125_profile_preferences.sql." : error.message,
      };
    }
    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { ok: true, error: null, notice: "Настройки сохранены." };
  } catch (error) {
    return { ...savedNotice, error: error instanceof Error ? error.message : "Не удалось сохранить настройки." };
  }
}

async function signedInClient() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, user: data.user };
}

function appOrigin() {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.strikeplatform.io").replace(/\/$/, "");
}

function authMessage(message: string) {
  const text = message.toLowerCase();
  if (text.includes("already") || text.includes("registered")) return "Этот email уже используется.";
  if (text.includes("email")) return "Не удалось обновить почту. Проверьте адрес и повторите.";
  if (text.includes("reauth") || text.includes("recent login") || text.includes("session")) {
    return "Сессия устарела. Войдите ещё раз и повторите.";
  }
  if (text.includes("different")) return "Новый пароль должен отличаться от текущего.";
  return message;
}
