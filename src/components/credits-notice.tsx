import { getEffectiveUserId } from "@/lib/account-context";
import { AGENT_REPLY_MIN_SC } from "@/lib/credits-policy";
import { readStrikeWallet } from "@/lib/strike-credits";

export async function creditsAreExhausted() {
  try {
    const wallet = await readStrikeWallet(await getEffectiveUserId());
    return wallet.credits < AGENT_REPLY_MIN_SC;
  } catch {
    return false;
  }
}
