import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { getSmmIntegrations, getSmmStrategy } from "@/app/actions/smm";
import { SmmView } from "@/components/smm/smm-view";
import { DEFAULT_SMM_STRATEGY, EMPTY_SMM_INTEGRATIONS } from "@/lib/smm-types";

export const metadata: Metadata = {
  title: "SMM",
};

export default function SmmPage() {
  return (
    <Suspense fallback={<SmmView strategy={DEFAULT_SMM_STRATEGY} integrations={EMPTY_SMM_INTEGRATIONS} loadError={null} />}>
      <LiveSmm />
    </Suspense>
  );
}

async function LiveSmm() {
  await io();
  const [strategy, integrations] = await Promise.all([getSmmStrategy(), getSmmIntegrations()]);
  const loadError = !strategy.ok ? strategy.error : !integrations.ok ? integrations.error : null;

  return (
    <SmmView
      strategy={strategy.ok ? strategy.strategy : DEFAULT_SMM_STRATEGY}
      integrations={integrations.ok ? integrations.integrations : EMPTY_SMM_INTEGRATIONS}
      loadError={loadError}
    />
  );
}
