import "server-only";

import { getExistingWorkspaceUserId } from "@/lib/agents";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function syncWhatsAppLink(agentId: string | null, authorized: boolean) {
  const userId = await getExistingWorkspaceUserId();
  if (!userId) return;

  const supabase = createSupabaseAdminClient();
  const { data: existing, error } = await supabase
    .from("integrations")
    .select("id, agent_id, status")
    .eq("user_id", userId)
    .eq("provider", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);

  if (!authorized) {
    if (!existing || existing.status === "disconnected") return;
    const { error: updateError } = await supabase
      .from("integrations")
      .update({ status: "disconnected" })
      .eq("id", existing.id);
    if (updateError) throw new Error(updateError.message);
    return;
  }

  const nextAgentId =
    existing?.status === "connected" && existing.agent_id
      ? (existing.agent_id as string)
      : agentId && UUID_PATTERN.test(agentId)
        ? agentId
        : null;

  if (!nextAgentId) return;
  if (existing?.status === "connected" && existing.agent_id === nextAgentId) return;

  const { data: agent, error: agentError } = await supabase
    .from("agents")
    .select("id")
    .eq("id", nextAgentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (agentError) throw new Error(agentError.message);
  if (!agent) return;

  const integrationId = existing
    ? await updateRow(supabase, existing.id as string, userId, nextAgentId)
    : await insertRow(supabase, userId, nextAgentId);

  if (!integrationId) return;

  const { error: secretError } = await supabase.from("integration_secrets").upsert({
    integration_id: integrationId,
    credentials: { source: "green-api" },
  });

  if (secretError) throw new Error(secretError.message);
}

async function updateRow(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  id: string,
  userId: string,
  agentId: string,
) {
  const { data, error } = await supabase
    .from("integrations")
    .update({ agent_id: agentId, name: "WhatsApp Business", status: "connected" })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data?.id as string | undefined) ?? null;
}

async function insertRow(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  agentId: string,
) {
  const { data, error } = await supabase
    .from("integrations")
    .insert({
      user_id: userId,
      agent_id: agentId,
      provider: "whatsapp",
      name: "WhatsApp Business",
      status: "connected",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id as string;
}
