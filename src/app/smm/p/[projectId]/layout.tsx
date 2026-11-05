import { io } from "next/cache";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { ProjectHeader } from "@/components/smm/project-nav";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getOwnedProject } from "@/lib/smm-projects";

export default function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-full bg-[#ffffff]" />}>
      <ProjectShell params={params}>{children}</ProjectShell>
    </Suspense>
  );
}

async function ProjectShell({ children, params }: { children: ReactNode; params: Promise<{ projectId: string }> }) {
  await io();
  const { projectId } = await params;
  const userId = await getAuthenticatedUserId();
  const project = await getOwnedProject(userId, projectId);
  if (!project) notFound();

  return (
    <div className="min-h-full bg-[#ffffff]">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <ProjectHeader project={project} />
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}
