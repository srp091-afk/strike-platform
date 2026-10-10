import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type WhatsAppAccountView = {
  id: string;
  phoneNumber: string;
  agentId: string;
  isActive: boolean;
};

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
