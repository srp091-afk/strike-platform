"use client";

import Link from "next/link";
import useSWR from "swr";

import { AdsProjectsList } from "@/components/ads-projects-list";
import { Button } from "@/components/ui/button";
import type { AdsProjectCard } from "@/lib/ad-project-types";
import { jsonFetcher } from "@/lib/swr";

type AdsListResponse = {
  projects: AdsProjectCard[];
};

function ListSkeleton() {
  return (
    <div className="mt-10 grid gap-4">
      {Array.from({ length: 3 }, (_, index) => (
        <div
          key={index}
          className="h-40 animate-pulse rounded-2xl border border-zinc-800 bg-[#111]"
        />
      ))}
    </div>
  );
}

export function AdsPageClient() {
  const { data, error, isLoading, mutate } = useSWR<AdsListResponse>("/api/ads", jsonFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-white">AI-Кампании</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Создавайте и запускайте прибыльные рекламные кампании в Meta, Google и TikTok с помощью ИИ-автоматизации.
          </p>
        </div>
        <Button asChild className="shrink-0 bg-strike text-white hover:brightness-110 hover:shadow-none">
          <Link href="/ads/new">+ Новый проект</Link>
        </Button>
      </header>

      {error ? (
        <p className="mt-10 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {error.message}
        </p>
      ) : isLoading && !data ? (
        <ListSkeleton />
      ) : (
        <AdsProjectsList
          initialProjects={data?.projects ?? []}
          onMutate={() => {
            void mutate();
          }}
        />
      )}
    </div>
  );
}
