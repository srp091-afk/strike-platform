import { io } from "next/cache";
import type { ReactNode } from "react";

import { LockedModuleOverlay } from "@/components/locked-module";
import { canUseModule, readAccess } from "@/lib/access";
import type { AccessModule } from "@/lib/config/pricing";

/** Прямой заход на закрытый модуль показывает заглушку вместо содержимого. */
export async function ModuleGate({ module, children }: { module: AccessModule; children: ReactNode }) {
  await io();
  const access = await readAccess();
  if (!canUseModule(access, module)) return <LockedModuleOverlay />;
  return children;
}
