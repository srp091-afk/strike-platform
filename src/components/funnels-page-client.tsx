"use client";

import useSWR from "swr";

import { FunnelHome } from "@/components/funnel-home";
import { SitesRouteSkeleton } from "@/components/route-loading-skeleton";
import type { LandingListItem } from "@/lib/landing-types";
import { jsonFetcher } from "@/lib/swr";

type LandingsResponse = {
  landings: LandingListItem[];
};

export function FunnelsPageClient() {
  const { data, error, isLoading } = useSWR<LandingsResponse>("/api/landings", jsonFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  if (isLoading && !data) {
    return <SitesRouteSkeleton />;
  }

  return <FunnelHome landings={data?.landings ?? []} loadError={error ? error.message : null} />;
}
