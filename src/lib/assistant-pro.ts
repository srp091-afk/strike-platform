import "server-only";

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

/** Доступ сессии, а не переключённого кабинета: владелец остаётся владельцем и в чужом аккаунте. */
export async function canUseAssistantPro() {
  const profile = await getAccountProfile();
  if (!profile) return false;
  const access = await readAccess(profile.id);
  return assistantProAllowed({ email: profile.email, isAdmin: access.isAdmin });
}
