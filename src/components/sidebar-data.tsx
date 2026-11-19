import { io } from "next/cache";

import { AppSidebar } from "@/components/app-sidebar";
import { readAccountSwitcher } from "@/lib/account-context";
import { getAccountProfile } from "@/lib/auth-user";

export async function SidebarData() {
  await io();
  const account = await getAccountProfile();
  const access = account ? await readAccountSwitcher() : { activeAccountId: "", accounts: [] };
  return <AppSidebar account={account} clients={access.accounts} activeAccountId={access.activeAccountId} />;
}
