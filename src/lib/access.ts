import "server-only";

import { getEffectiveUserId } from "@/lib/account-context";
import { normalizeAgentTier, resolveAccess, type AccessModule, type AgentTier } from "@/lib/config/pricing";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const AGENT_LIMIT_MESSAGE = "Вы достигли лимита агентов для вашего тарифа";

export type AccountAccess = ReturnType<typeof resolveAccess> & { userId: string };

/** Тариф и is_admin кабинета, в котором сейчас работает пользователь. */
export async function readAccess(userId?: string): Promise<AccountAccess> {
  const id = userId ?? (await getEffectiveUserId());
  const profile = await readProfileAccess(id);
  return { userId: id, ...resolveAccess(profile) };
}

export function canUseModule(access: AccountAccess, module: AccessModule) {
  return access.allowedModules.includes(module);
}

/** Серверная проверка перед вставкой агента. Админ не ограничен. */
export async function assertCanCreateAgent(userId: string) {
  const access = await readAccess(userId);
  if (access.isAdmin || !Number.isFinite(access.maxAgents)) return;

  const admin = createSupabaseAdminClient();
  const { count, error } = await admin.from("agents").select("id", { count: "exact", head: true }).eq("user_id", userId);
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= access.maxAgents) throw new Error(AGENT_LIMIT_MESSAGE);
}

async function readProfileAccess(userId: string): Promise<{ tier_agents: AgentTier; is_admin: boolean }> {
  const admin = createSupabaseAdminClient();
  const query = await admin.from("profiles").select("tier_agents, is_admin").eq("id", userId).maybeSingle();
  if (!query.error && query.data) {
    return { tier_agents: normalizeAgentTier(query.data.tier_agents), is_admin: Boolean(query.data.is_admin) };
  }
  if (query.error && /is_admin/.test(query.error.message)) {
    const fallback = await admin.from("profiles").select("tier_agents").eq("id", userId).maybeSingle();
    return { tier_agents: normalizeAgentTier(fallback.data?.tier_agents), is_admin: false };
  }
  return { tier_agents: "trial", is_admin: false };
}
