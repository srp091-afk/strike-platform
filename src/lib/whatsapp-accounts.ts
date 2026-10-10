import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type WhatsAppAccountView = {
  id: string;
  phoneNumber: string;
  agentId: string;
  isActive: boolean;
};

export type WhatsAppCredentialDefaults = {
  instanceId: string;
  apiToken: string;
};

const emptyCredentials: WhatsAppCredentialDefaults = { instanceId: "", apiToken: "" };

export async function readWhatsAppCredentialDefaults(): Promise<WhatsAppCredentialDefaults> {
  const fromEnv = readEnvCredentials();
  if (fromEnv) return fromEnv;

  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("whatsapp_accounts")
      .select("instance_id, api_token")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return emptyCredentials;
    const instanceId = String(data.instance_id ?? "").trim();
    const apiToken = String(data.api_token ?? "").trim();
    if (/^\d{4,}$/.test(instanceId) && apiToken.length >= 8) {
      return { instanceId, apiToken };
    }
  } catch {
    return emptyCredentials;
  }

  return emptyCredentials;
}

function readEnvCredentials(): WhatsAppCredentialDefaults | null {
  const instanceId = process.env.GREEN_API_ID_INSTANCE?.trim() ?? "";
  const apiToken = process.env.GREEN_API_TOKEN_INSTANCE?.trim() ?? "";
  if (!/^\d{4,}$/.test(instanceId) || apiToken.length < 8) return null;
  return { instanceId, apiToken };
}

export async function listWhatsAppAccounts(): Promise<WhatsAppAccountView[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("whatsapp_accounts")
    .select("id, phone_number, agent_id, is_active")
    .order("created_at", { ascending: true });

  if (error) {
    if (error.message.includes("whatsapp_accounts")) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    phoneNumber: String(row.phone_number ?? ""),
    agentId: String(row.agent_id ?? ""),
    isActive: row.is_active !== false,
  }));
}
