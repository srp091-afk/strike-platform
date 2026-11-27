import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublishedSite, siteMetadata } from "@/components/sites/published-site";
import { normalizeSubdomain } from "@/lib/sites/domains";
import { getPublishedBySubdomain } from "@/lib/sites/store";

export async function generateMetadata({ params }: { params: Promise<{ subdomain: string }> }): Promise<Metadata> {
  const { subdomain } = await params;
  const found = normalizeSubdomain(subdomain).ok ? await getPublishedBySubdomain(subdomain) : null;
  return siteMetadata(found?.site ?? null);
}

export default async function PublicSubdomainPage({ params }: { params: Promise<{ subdomain: string }> }) {
  const { subdomain } = await params;
  const normalized = normalizeSubdomain(subdomain);
  if (!normalized.ok) notFound();
  const found = await getPublishedBySubdomain(normalized.slug);
  if (!found) notFound();
  return <PublishedSite site={found.site} live={found.live} />;
}
