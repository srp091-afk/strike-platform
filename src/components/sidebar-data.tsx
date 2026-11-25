import { io } from "next/cache";

import { AppSidebar } from "@/components/app-sidebar";
import { readAccountSwitcher } from "@/lib/account-context";
import { readAccess } from "@/lib/access";
import { getAccountProfile } from "@/lib/auth-user";
import { ASSISTANT_PRO_HREF, assistantProAllowed } from "@/lib/assistant-pro";
import { lockedModuleHrefs } from "@/lib/config/pricing";
import { readCabinetNotices } from "@/lib/read-cabinet-notices";
import { countPendingApprovals } from "@/lib/proactive/load";
import { readStrikeWallet } from "@/lib/strike-credits";

export async function SidebarData() {
  await io();
  const account = await getAccountProfile();
  const access = account ? await readAccountSwitcher() : { activeAccountId: "", accounts: [] };
  const gate = account ? await readAccess(access.activeAccountId) : null;
  const walletUserId = access.activeAccountId || account?.id || "";
  const wallet = walletUserId ? await readStrikeWallet(walletUserId).catch(() => null) : null;
  const notices = walletUserId ? await readCabinetNotices(walletUserId) : [];
  const sessionAccess = account ? await readAccess(account.id) : null;
  const assistantOpen = assistantProAllowed({ email: account?.email, isAdmin: Boolean(sessionAccess?.isAdmin) });
  const taskCount = assistantOpen && walletUserId ? await countPendingApprovals(walletUserId) : 0;
  const lockedHrefs = gate ? [...lockedModuleHrefs(gate.allowedModules)] : [];
  if (!assistantOpen && !lockedHrefs.includes(ASSISTANT_PRO_HREF)) lockedHrefs.push(ASSISTANT_PRO_HREF);
  return (
    <AppSidebar
      account={account}
      clients={access.accounts}
      activeAccountId={access.activeAccountId}
      lockedHrefs={lockedHrefs}
      wallet={wallet}
      notices={notices}
      taskCount={taskCount}
    />
  );
}
