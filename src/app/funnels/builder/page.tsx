import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { FunnelStudio } from "@/components/funnel-studio";
import { listAgents } from "@/lib/agents";
import { getLanding } from "@/lib/landings";

export const metadata: Metadata = {
  title: "Конструктор",
};

export default function BuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string | string[]; id?: string | string[] }>;
}) {
  return (
    <Suspense fallback={<div className="h-[calc(100dvh-4rem)] bg-black" />}>
      <BuilderData searchParams={searchParams} />
    </Suspense>
  );
}

async function BuilderData({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string | string[]; id?: string | string[] }>;
}) {
  await io();
  const params = await searchParams;
  const prompt = first(params.prompt);
  const id = first(params.id);
  const [agents, landing] = await Promise.all([listAgents(), id ? getLanding(id) : Promise.resolve(null)]);

  return (
    <FunnelStudio
      agents={agents.filter((agent) => agent.is_active).map((agent) => ({ id: agent.id, name: agent.name }))}
      initialLanding={landing}
      initialPrompt={landing ? "" : prompt}
    />
  );
}

function first(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.trim() ?? "";
}
