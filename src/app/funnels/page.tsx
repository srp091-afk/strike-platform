import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { FunnelHome } from "@/components/funnel-home";
import { listLandings } from "@/lib/landings";

export const metadata: Metadata = {
  title: "Сайты",
};

export default function FunnelsPage() {
  return (
    <Suspense fallback={<div className="mx-auto mt-24 h-40 max-w-3xl rounded-[28px] border border-zinc-800/50 bg-zinc-900/50" />}>
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
