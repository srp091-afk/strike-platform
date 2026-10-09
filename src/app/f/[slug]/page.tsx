import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { io } from "next/cache";

import { FunnelPreview } from "@/components/funnel-preview";
import { listAgents } from "@/lib/agents";
import { getFunnelTemplateBySlug, personalizeWelcome } from "@/lib/funnel-templates";

type FunnelSearch = {
  utm_campaign?: string | string[];
  utm_content?: string | string[];
  agent?: string | string[];
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const template = getFunnelTemplateBySlug(slug);
  return { title: template?.title ?? "Воронка" };
}

export default function PublicFunnelPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<FunnelSearch>;
}) {
  return (
    <Suspense fallback={<div className="mx-auto mt-16 h-[40rem] max-w-md rounded-2xl bg-white shadow-sm" />}>
      <PublicFunnel params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PublicFunnel({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<FunnelSearch>;
}) {
  await io();
  const { slug } = await params;
  const query = await searchParams;
  const template = getFunnelTemplateBySlug(slug);
  if (!template) notFound();

  const campaign = firstQuery(query.utm_campaign) || template.previewCampaign;
  const content = firstQuery(query.utm_content) || template.previewContent;
  const agentId = firstQuery(query.agent);
  const agentName = await resolveAgentName(agentId);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col px-4 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-strike">Воронка</p>
      <h1 className="mt-2 text-3xl font-semibold">{template.title}</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{template.summary}</p>
      <div className="mt-8">
        <FunnelPreview
          variant="page"
          agentName={agentName}
          welcome={personalizeWelcome(template.welcome, campaign, content)}
          widgets={template.widgets}
          styles={template.styles}
          budgets={template.budgets}
          areas={template.areas}
          phone={template.whatsappPhone}
          messageTemplate={template.whatsappTemplate}
        />
      </div>
    </div>
  );
}

async function resolveAgentName(agentId: string) {
  if (!agentId) return "STRIKE";
  try {
    const agents = await listAgents();
    return agents.find((agent) => agent.id === agentId)?.name ?? "STRIKE";
  } catch {
    return "STRIKE";
  }
}

function firstQuery(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}
