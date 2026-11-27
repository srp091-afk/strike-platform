import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublishedSite, siteMetadata } from "@/components/sites/published-site";
import { getPublishedByHost } from "@/lib/sites/store";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ host: string; path?: string[] }>;
}): Promise<Metadata> {
  const { host } = await params;
  const found = await getPublishedByHost(decodeURIComponent(host));
  return siteMetadata(found?.site ?? null);
}

export default async function HostSitePage({
  params,
}: {
  params: Promise<{ host: string; path?: string[] }>;
}) {
  const { host } = await params;
  const found = await getPublishedByHost(decodeURIComponent(host));
  if (!found) notFound();
  return <PublishedSite site={found.site} live={found.live} />;
}
