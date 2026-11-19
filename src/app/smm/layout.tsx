import { Suspense, type ReactNode } from "react";

import { ModuleGate } from "@/components/module-gate";

export default function SmmLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <ModuleGate module="smm">{children}</ModuleGate>
    </Suspense>
  );
}
