import { io } from "next/cache";

import { AppSidebar } from "@/components/app-sidebar";
import { readAccountSwitcher } from "@/lib/account-context";
import { readAccess } from "@/lib/access";
import { getAccountProfile } from "@/lib/auth-user";
import { lockedModuleHrefs } from "@/lib/config/pricing";
import { readStrikeWallet } from "@/lib/strike-credits";

export async function SidebarData() {
  await io();
  const account = await getAccountProfile();
  const access = account ? await readAccountSwitcher() : { activeAccountId: "", accounts: [] };
  const gate = account ? await readAccess(access.activeAccountId) : null;
  const walletUserId = access.activeAccountId || account?.id || "";
  const wallet = walletUserId ? await readStrikeWallet(walletUserId).catch(() => null) : null;
  return (
    <AppSidebar
      account={account}
      clients={access.accounts}
      activeAccountId={access.activeAccountId}
      lockedHrefs={gate ? lockedModuleHrefs(gate.allowedModules) : []}
      wallet={wallet}
    />
  );
}
