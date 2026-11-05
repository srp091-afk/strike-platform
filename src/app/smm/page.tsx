import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { getSmmStrategy, getSmmStudio } from "@/app/actions/smm";
import { SmmView } from "@/components/smm/smm-view";
import { DEFAULT_SMM_STRATEGY, EMPTY_SMM_STUDIO } from "@/lib/smm-types";

export const metadata: Metadata = {
  title: "SMM",
};

export default function SmmPage() {
  return (
    <Suspense fallback={<SmmView strategy={DEFAULT_SMM_STRATEGY} studio={EMPTY_SMM_STUDIO} loadError={null} />}>
      <LiveSmm />
    </Suspense>
  );
}

async function LiveSmm() {
  await io();
  const [strategy, studio] = await Promise.all([getSmmStrategy(), getSmmStudio()]);
  const loadError = !strategy.ok ? strategy.error : !studio.ok ? studio.error : null;

  return (
    <SmmView
      strategy={strategy.ok ? strategy.strategy : DEFAULT_SMM_STRATEGY}
      studio={studio.ok ? studio.studio : EMPTY_SMM_STUDIO}
      loadError={loadError}
    />
  );
}
