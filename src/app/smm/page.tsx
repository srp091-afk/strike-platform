import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";

import { getProjects } from "@/app/actions/smm-projects";
import { SmmProjectsView } from "@/components/smm/smm-projects-view";

export const metadata: Metadata = {
  title: "SMM",
};

export default function SmmPage() {
  return (
    <Suspense fallback={<SmmProjectsView projects={[]} loadError={null} />}>
      <LiveProjects />
    </Suspense>
  );
}

async function LiveProjects() {
  await io();
  const result = await getProjects();
  return <SmmProjectsView projects={result.ok ? result.projects : []} loadError={result.ok ? null : result.error} />;
}
