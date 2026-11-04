import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";

import { OutreachWorkspace } from "@/components/outreach/outreach-workspace";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { listAgentOptions, loadCampaignState } from "@/lib/outreach";

export const metadata: Metadata = {
  title: "Рассылка",
};

export default function OutreachCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="mx-auto h-80 max-w-7xl px-6 py-10" />}>
      <CampaignContent params={params} />
    </Suspense>
  );
}

async function CampaignContent({ params }: { params: Promise<{ id: string }> }) {
  await io();
  const { id } = await params;

  let state: Awaited<ReturnType<typeof loadCampaignState>> = null;
  let agents: Awaited<ReturnType<typeof listAgentOptions>> = [];
  let error: string | null = null;
  try {
    const userId = await getAuthenticatedUserId();
    [state, agents] = await Promise.all([loadCampaignState(userId, id), listAgentOptions()]);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Не удалось загрузить рассылку.";
  }

  if (error || !state) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-10">
        <Link href="/outreach" className="text-sm text-zinc-400 hover:text-white">
          ← Все рассылки
        </Link>
        <p className="mt-6 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error ?? "Рассылка не найдена."}
        </p>
      </div>
    );
  }

  return <OutreachWorkspace initial={state} agents={agents} />;
}
