import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { io } from "next/cache";

import { QuizStudio } from "@/components/sites/quiz-studio";
import { listAgents } from "@/lib/agents";
import { getOwnedSite } from "@/lib/sites/store";

export const metadata: Metadata = { title: "Студия" };

export default async function SiteStudioPage({ params }: { params: Promise<{ id: string }> }) {
  await io();
  const { id } = await params;
  const site = await getOwnedSite(id);
  if (!site) notFound();
  if (site.siteType !== "quiz") redirect(`/funnels/builder?id=${site.id}`);
  const agents = await listAgents();
  return (
    <QuizStudio
      site={{
        id: site.id,
        title: site.title,
        subdomain: site.subdomain,
        customDomain: site.customDomain,
        leads: site.leads,
        draft: site.draft,
        theme: site.theme,
        analytics: site.analytics,
        seo: site.seo,
        agentId: site.agentId,
      }}
      agents={agents.filter((agent) => agent.is_active).map((agent) => ({ id: agent.id, name: agent.name }))}
    />
  );
}
