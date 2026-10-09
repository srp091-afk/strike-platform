import "server-only";

import { cache } from "react";

import type { AgentRecord } from "@/lib/agent-models";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const WORKSPACE_EMAIL = "owner@strike.local";

export async function getExistingWorkspaceUserId() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  return (data?.[0]?.id as string | undefined) ?? null;
}

export const getWorkspaceUserId = cache(async () => {
  const existing = await getExistingWorkspaceUserId();
  if (existing) return existing;

  const supabase = createSupabaseAdminClient();

  const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (listError) {
    throw new Error(listError.message);
  }

  const listedUser = listed.users.find((user) => user.email === WORKSPACE_EMAIL);
  const userId = listedUser?.id ?? (await createWorkspaceUser(supabase));

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    full_name: "STRIKE",
  });

  if (profileError) {
    throw new Error(profileError.message);
  }

  return userId;
});

async function createWorkspaceUser(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: WORKSPACE_EMAIL,
    email_confirm: true,
    user_metadata: { full_name: "STRIKE" },
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Не удалось создать профиль");
  }

  return data.user.id;
}

export async function listAgents(): Promise<AgentRecord[]> {
  const supabase = createSupabaseAdminClient();
  const userId = await getExistingWorkspaceUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, system_prompt, model, temperature, is_active, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as AgentRecord[];
}

export async function getDashboardCounts() {
  const supabase = createSupabaseAdminClient();
  const [agents, integrations, conversations, messages] = await Promise.all([
    supabase.from("agents").select("id", { count: "exact", head: true }),
    supabase.from("integrations").select("id", { count: "exact", head: true }),
    supabase.from("conversations").select("id", { count: "exact", head: true }),
    supabase.from("messages").select("id", { count: "exact", head: true }),
  ]);

  const error =
    agents.error?.message ??
    integrations.error?.message ??
    conversations.error?.message ??
    messages.error?.message ??
    null;

  return {
    agents: agents.count ?? 0,
    integrations: integrations.count ?? 0,
    chats: conversations.count ?? 0,
    messages: messages.count ?? 0,
    error,
  };
}
