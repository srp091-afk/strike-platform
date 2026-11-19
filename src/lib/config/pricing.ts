/** Лимиты модулей. SMM, Ads и Сайты закрыты на всех тарифах, их открывает только is_admin. */
export type AgentTier = "trial" | "start" | "pro" | "agency";
export type AccessModule = "agents" | "smm" | "ads" | "sites";

export type ProfileAccess = {
  tier_agents: AgentTier;
  is_admin: boolean;
};

export const TIER_LIMITS = {
  trial: { maxAgents: 1, allowedModules: ["agents"] },
  start: { maxAgents: 3, allowedModules: ["agents"] },
  pro: { maxAgents: 10, allowedModules: ["agents"] },
  agency: { maxAgents: Infinity, allowedModules: ["agents"] },
} as const satisfies Record<AgentTier, { maxAgents: number; allowedModules: readonly AccessModule[] }>;

export const MODULE_HREFS: Record<Exclude<AccessModule, "agents">, string> = {
  smm: "/smm",
  ads: "/ads",
  sites: "/funnels",
};

const ADMIN_MODULES: AccessModule[] = ["agents", "smm", "ads", "sites"];

export function normalizeAgentTier(value: unknown): AgentTier {
  return value === "start" || value === "pro" || value === "agency" || value === "trial" ? value : "trial";
}

export function resolveAccess(profile: ProfileAccess) {
  const tier = normalizeAgentTier(profile.tier_agents);
  if (profile.is_admin) {
    return { isAdmin: true, tier, maxAgents: Number.POSITIVE_INFINITY, allowedModules: ADMIN_MODULES };
  }
  const limits = TIER_LIMITS[tier];
  return { isAdmin: false, tier, maxAgents: limits.maxAgents, allowedModules: [...limits.allowedModules] };
}

export function moduleAllowed(allowedModules: readonly AccessModule[], module: AccessModule) {
  return allowedModules.includes(module);
}

export function lockedModuleHrefs(allowedModules: readonly AccessModule[]) {
  return (Object.entries(MODULE_HREFS) as [Exclude<AccessModule, "agents">, string][])
    .filter(([module]) => !moduleAllowed(allowedModules, module))
    .map(([, href]) => href);
}
