import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { FunnelHome } from "@/components/funnel-home";
import { listLandings } from "@/lib/landings";

export const metadata: Metadata = {
  title: "Воронки",
};

export default function FunnelsPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-24 h-40 max-w-3xl rounded-[28px] border border-zinc-200/80 bg-white" />}>
      <FunnelsData />
    </Suspense>
  );
}

async function FunnelsData() {
  await io();

  try {
    const landings = await listLandings();
    return <FunnelHome landings={landings} loadError={null} />;
  } catch (error) {
    return (
      <FunnelHome
        landings={[]}
        loadError={error instanceof Error ? error.message : "Не удалось загрузить воронки."}
      />
    );
  }
}
