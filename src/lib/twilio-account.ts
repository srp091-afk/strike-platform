import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import type { TwilioAuth } from "@/lib/twilio-content";

export const TWILIO_NOT_CONNECTED = "Сначала подключите аккаунт Twilio в настройках интеграций";

type ConfigRow = {
  user_id: string;
  account_sid: string;
  auth_token: string;
  whatsapp_number: string;
};

function accountOf(row: ConfigRow): TwilioAuth & { userId: string } {
  return {
    userId: row.user_id,
    accountSid: row.account_sid,
    authToken: row.auth_token,
    whatsappNumber: row.whatsapp_number,
  };
}

export function canonicalWhatsappNumber(value: string) {
  const digits = value.replace(/^whatsapp:/i, "").replace(/\D/g, "").slice(0, 15);
  return digits.length >= 8 ? `+${digits}` : "";
}

async function readConfig(filter: { column: "user_id" | "whatsapp_number"; value: string }) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_twilio_configs")
    .select("user_id, account_sid, auth_token, whatsapp_number")
    .eq(filter.column, filter.value)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    const missing = /user_twilio_configs/.test(error.message);
    return { error: missing ? "Примените миграцию 20261119_user_twilio_configs.sql." : error.message } as const;
  }
  return { account: data ? accountOf(data as ConfigRow) : null } as const;
}

export function twilioAccountForUser(userId: string) {
  return readConfig({ column: "user_id", value: userId });
}

export function twilioAccountForNumber(rawNumber: string) {
  const number = canonicalWhatsappNumber(rawNumber);
  if (!number) return Promise.resolve({ account: null } as const);
  return readConfig({ column: "whatsapp_number", value: number });
}
