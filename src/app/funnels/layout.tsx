import { Suspense, type ReactNode } from "react";

import { ModuleGate } from "@/components/module-gate";

export default function FunnelsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ModuleGate module="sites">{children}</ModuleGate>
    </Suspense>
  );
}
