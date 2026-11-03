import { io } from "next/cache";

import { AppSidebar } from "@/components/app-sidebar";
import { getAccountProfile } from "@/lib/auth-user";

export async function SidebarData() {
  await io();
  const account = await getAccountProfile();
  return <AppSidebar account={account} />;
}
