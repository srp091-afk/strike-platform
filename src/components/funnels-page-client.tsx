"use client";

import useSWR from "swr";

import { SitesHub } from "@/components/sites/sites-hub";
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

  return <SitesHub sites={data?.landings ?? []} loadError={error ? error.message : null} />;
}
