import "server-only";

import { AGENT_REPLY_MIN_SC, agentReplyCost, CREDITS_EMPTY_MESSAGE } from "@/lib/credits-policy";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { normalizeAgentTier, type AgentTier } from "@/lib/config/pricing";

export { AGENT_REPLY_MIN_SC, CREDITS_EMPTY_MESSAGE, agentReplyCost };

export class CreditsExhaustedError extends Error {
  constructor() {
    super(CREDITS_EMPTY_MESSAGE);
    this.name = "CreditsExhaustedError";
  }
}

export function readUsageTokens(usage: unknown) {
  if (!usage || typeof usage !== "object") return 0;
  const record = usage as Record<string, unknown>;
  const total = Number(record.total_tokens);
  if (Number.isFinite(total) && total > 0) return total;
  const input = Number(record.input_tokens ?? record.prompt_tokens ?? 0);
  const output = Number(record.output_tokens ?? record.completion_tokens ?? 0);
  const sum = (Number.isFinite(input) ? input : 0) + (Number.isFinite(output) ? output : 0);
  return sum > 0 ? sum : 0;
}

export type StrikeWallet = { credits: number; tier: AgentTier };

export async function readStrikeWallet(userId: string): Promise<StrikeWallet> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("profiles").select("strike_credits, tier_agents").eq("id", userId).maybeSingle();
  if (error || !data) return { credits: 0, tier: "trial" };
  return {
    credits: Math.max(0, Number(data.strike_credits ?? 0)),
    tier: normalizeAgentTier(data.tier_agents),
  };
}

/** Не пускает генерацию, если на ответ не хватает минимума. */
export async function assertCanSpendAgentReply(userId: string) {
  const wallet = await readStrikeWallet(userId);
  if (wallet.credits < AGENT_REPLY_MIN_SC) throw new CreditsExhaustedError();
  return wallet.credits;
}

/** Списывает стоимость ответа с баланса. В историю платежей строку не пишет. */
export async function spendAgentReply(input: { userId: string; totalTokens: number | null }) {
  const credits = agentReplyCost(input.totalTokens);
  const admin = createSupabaseAdminClient();
  const tokens = input.totalTokens && input.totalTokens > 0 ? ` · ${input.totalTokens} ток.` : "";
  const { data, error } = await admin.rpc("spend_strike_credits", {
    p_user_id: input.userId,
    p_credits: credits,
    p_order_id: `usage_${crypto.randomUUID()}`,
    p_description: `Ответ агента · ${credits} SC${tokens}`,
  });
  if (error) {
    console.error("[credits] spend_strike_credits", error.message);
    return null;
  }
  const remaining = Number(data);
  return Number.isFinite(remaining) ? remaining : null;
}
