import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { readBotFlags } from "@/lib/bot-state";

type Admin = SupabaseClient;

export async function openChannelConversation(
  supabase: Admin,
  input: {
    userId: string;
    agentId: string;
    provider: "viber" | "email";
    externalChatId: string;
    contactName: string | null;
    preview: string;
  },
) {
  const integrationId = await ensureIntegration(supabase, input);
  const { data: existing, error: lookupError } = await supabase
    .from("conversations")
    .select("id")
    .eq("integration_id", integrationId)
    .eq("external_chat_id", input.externalChatId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const patch = {
    user_id: input.userId,
    agent_id: input.agentId,
    contact_handle: input.externalChatId,
    last_message_preview: input.preview.slice(0, 140),
    last_message_at: new Date().toISOString(),
    ...(input.contactName ? { contact_name: input.contactName } : {}),
  };

  if (existing?.id) {
    const { error } = await supabase.from("conversations").update(patch).eq("id", existing.id);
    if (error) throw new Error(error.message);
    const flags = await readBotFlags(supabase, [existing.id as string]);
    return { id: existing.id as string, botActive: flags.get(existing.id as string) ?? true };
  }

  const { data, error } = await supabase
    .from("conversations")
    .insert({ ...patch, integration_id: integrationId, external_chat_id: input.externalChatId })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось создать диалог.");
  const flags = await readBotFlags(supabase, [data.id as string]);
  return { id: data.id as string, botActive: flags.get(data.id as string) ?? true };
}

async function ensureIntegration(
  supabase: Admin,
  input: { userId: string; agentId: string; provider: "viber" | "email" },
) {
  const externalId = `${input.provider}:${input.agentId}`;
  const { data: existing, error: lookupError } = await supabase
    .from("integrations")
    .select("id")
    .eq("provider", input.provider)
    .eq("external_id", externalId)
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing?.id) {
    await supabase
      .from("integrations")
      .update({ agent_id: input.agentId, user_id: input.userId, status: "connected" })
      .eq("id", existing.id);
    return existing.id as string;
  }

  const { data, error } = await supabase
    .from("integrations")
    .insert({
      user_id: input.userId,
      agent_id: input.agentId,
      provider: input.provider,
      name: input.provider === "viber" ? "Viber" : "Email",
      status: "connected",
      external_id: externalId,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось привязать канал.");
  return data.id as string;
}
