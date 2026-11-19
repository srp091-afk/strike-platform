"use server";

import { getEffectiveUserId } from "@/lib/account-context";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { verifyTwilioAccount } from "@/lib/twilio-content";

const SID_PATTERN = /^AC[a-f0-9]{32}$/i;

function phoneNumber(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : "";
}

export async function readTwilioConfig() {
  const userId = await getEffectiveUserId();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_twilio_configs")
    .select("account_sid, whatsapp_number")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    const missing = /user_twilio_configs/.test(error.message);
    return { ok: false as const, error: missing ? "Примените миграцию 20261119_user_twilio_configs.sql." : error.message };
  }
  return {
    ok: true as const,
    accountSid: typeof data?.account_sid === "string" ? data.account_sid : "",
    whatsappNumber: typeof data?.whatsapp_number === "string" ? data.whatsapp_number : "",
    hasToken: Boolean(data),
  };
}

export async function saveTwilioConfig(input: { accountSid: string; authToken: string; whatsappNumber: string }) {
  const userId = await getEffectiveUserId();
  const accountSid = input.accountSid.trim();
  const whatsappNumber = phoneNumber(input.whatsappNumber);
  const typedToken = input.authToken.trim();
  if (!SID_PATTERN.test(accountSid)) return { ok: false as const, error: "Account SID начинается с AC и содержит 34 символа." };
  if (!whatsappNumber) return { ok: false as const, error: "Номер укажите в формате +1234567890." };

  const supabase = createSupabaseAdminClient();
  const { data: existing, error: readError } = await supabase
    .from("user_twilio_configs")
    .select("auth_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) {
    const missing = /user_twilio_configs/.test(readError.message);
    return { ok: false as const, error: missing ? "Примените миграцию 20261119_user_twilio_configs.sql." : readError.message };
  }

  const authToken = typedToken || (typeof existing?.auth_token === "string" ? existing.auth_token : "");
  if (authToken.length < 10) return { ok: false as const, error: "Введите Auth Token из консоли Twilio." };

  const verified = await verifyTwilioAccount({ accountSid, authToken });
  if ("error" in verified) return { ok: false as const, error: verified.error };

  const { error } = await supabase.from("user_twilio_configs").upsert(
    {
      user_id: userId,
      account_sid: accountSid,
      auth_token: authToken,
      whatsapp_number: whatsappNumber,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    if (error.code === "23505") return { ok: false as const, error: "Этот номер уже подключён к другому аккаунту." };
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const };
}
