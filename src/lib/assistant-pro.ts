import "server-only";

import { getEffectiveUserId, readAccountSwitcher } from "@/lib/account-context";
import { readAccess } from "@/lib/access";
import { getAccountProfile } from "@/lib/auth-user";

/** Пока true, «Ассистент Pro» закрыт на всех тарифах, кроме владельца платформы и is_admin. */
export const ASSISTANT_PRO_LOCKED_FOR_ALL_TIERS = true;

export const ASSISTANT_PRO_HREF = "/ai-tasks";

const OWNER_EMAIL = "srp091@gmail.com";

export function assistantProAllowed(input: { email?: string | null; isAdmin: boolean }) {
  if (!ASSISTANT_PRO_LOCKED_FOR_ALL_TIERS) return true;
  const email = (input.email ?? "").trim().toLowerCase();
  return input.isAdmin || email === OWNER_EMAIL;
}

/** Доступ считается по открытому кабинету. Чужой кабинет без is_admin раздел не открывает. */
export async function canUseAssistantPro() {
  const profile = await getAccountProfile();
  if (!profile) return false;
  let userId = profile.id;
  try {
    userId = await getEffectiveUserId();
  } catch {
    return false;
  }
  const access = await readAccess(userId);
  let email = profile.email;
  if (userId !== profile.id) {
    const { accounts } = await readAccountSwitcher();
    email = accounts.find((item) => item.id === userId)?.email ?? "";
  }
  return assistantProAllowed({ email, isAdmin: access.isAdmin });
}
