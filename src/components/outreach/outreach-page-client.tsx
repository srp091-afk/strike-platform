"use client";

import { Send, Trash2 } from "lucide-react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import useSWR from "swr";

import { createCampaignDraft, deleteCampaign } from "@/app/outreach/actions";
import { CampaignStatusBadge, ProgressBar, cardClass } from "@/components/outreach/outreach-ui";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { OUTREACH_CHANNELS, type OutreachCampaignCard } from "@/lib/outreach-types";
import { jsonFetcher } from "@/lib/swr";

function NewCampaignButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="shrink-0 bg-strike text-white hover:brightness-110 hover:shadow-none">
      {pending ? "Создаём..." : "+ Новая рассылка"}
    </Button>
  );
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "";
}

export function OutreachPageClient() {
  const { data, error, isLoading, mutate } = useSWR<{ campaigns: OutreachCampaignCard[] }>("/api/outreach", jsonFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const campaigns = data?.campaigns ?? [];

  async function remove(campaign: OutreachCampaignCard) {
    if (!window.confirm(`Удалить рассылку «${campaign.name}» вместе с базой и логами?`)) return;
    const result = await deleteCampaign(campaign.id);
    if (!result.ok) return toast.error(result.error);
    toast.success("Рассылка удалена");
    void mutate();
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-white">Рассылки</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Загрузите базу, выберите агента и канал: ИИ изучит сайт каждого контакта и отправит персональное первое сообщение.
            Ответы клиентов подхватит агент.
          </p>
        </div>
        <form action={createCampaignDraft}>
          <NewCampaignButton />
        </form>
      </header>

      {error ? (
        <p className="mt-10 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">{error.message}</p>
      ) : isLoading && !data ? (
        <div className="mt-10 grid gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl border border-zinc-800 bg-gray-100" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="mt-16 grid place-items-center">
          <div className="grid max-w-md justify-items-center rounded-2xl border border-zinc-800 px-8 py-16 text-center">
            <Send className="size-8 text-zinc-600" strokeWidth={1.5} />
            <p className="mt-4 text-sm leading-6 text-zinc-400">Рассылок пока нет. Создайте первую, чтобы начать холодный аутрич с ИИ.</p>
          </div>
        </div>
      ) : (
        <ul className="mt-10 grid gap-4">
          {campaigns.map((campaign) => {
            const channel = OUTREACH_CHANNELS.find((item) => item.value === campaign.channel_type)?.label;
            return (
              <li key={campaign.id} className={`${cardClass} transition-colors hover:border-zinc-600`}>
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link href={`/outreach/${campaign.id}`} className="truncate font-heading text-xl font-semibold text-white hover:underline">
                        {campaign.name}
                      </Link>
                      <CampaignStatusBadge status={campaign.status} />
                    </div>
                    <p className="mt-2 text-sm text-zinc-400">
                      Агент: {campaign.agent_name ?? "не выбран"} · Канал: {channel ?? "не выбран"} · {formatDate(campaign.created_at)}
                    </p>
                  </div>
                  <div className="w-full lg:w-64">
                    <p className="mb-2 text-sm font-medium text-white">
                      {campaign.sent}/{campaign.total} отправлено
                      {campaign.failed > 0 ? <span className="ml-2 text-xs font-normal text-rose-600">ошибок: {campaign.failed}</span> : null}
                    </p>
                    <ProgressBar sent={campaign.sent} failed={campaign.failed} total={campaign.total} />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild>
                      <Link href={`/outreach/${campaign.id}`}>Открыть</Link>
                    </Button>
                    <Button type="button" variant="outline" size="icon" aria-label={`Удалить ${campaign.name}`} onClick={() => void remove(campaign)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
