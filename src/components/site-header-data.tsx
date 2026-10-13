import { io } from "next/cache";

import { SiteHeader } from "@/components/site-header";
import { getAccountProfile } from "@/lib/auth-user";

export async function SiteHeaderData() {
  await io();
  const account = await getAccountProfile();
  return <SiteHeader account={account} />;
}
