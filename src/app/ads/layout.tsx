import { Suspense, type ReactNode } from "react";

import { ModuleGate } from "@/components/module-gate";

export default function AdsLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ModuleGate module="ads">{children}</ModuleGate>
    </Suspense>
  );
}
