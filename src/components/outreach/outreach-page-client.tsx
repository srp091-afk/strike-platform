"use client";

import { Loader2, Pause, Play, Send, Square, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import useSWR, { type KeyedMutator } from "swr";

import { controlCampaign, createCampaignDraft, deleteCampaign } from "@/app/leads/actions";
import { CampaignStatusBadge, ProgressBar, cardClass } from "@/components/outreach/outreach-ui";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { OUTREACH_CHANNELS, type OutreachCampaignCard, type OutreachStatus } from "@/lib/outreach-types";
import { jsonFetcher, useClientReady } from "@/lib/swr";

type CampaignList = { campaigns: OutreachCampaignCard[] };
type ControlAction = "start" | "pause" | "stop";

const NEXT_STATUS: Record<ControlAction, OutreachStatus> = {
  start: "active",
  pause: "paused",
  stop: "completed",
};

function NewCampaignButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="shrink-0 bg-strike text-white hover:brightness-110 hover:shadow-none">
      {pending ? "Создаём..." : "+ Новая кампания"}
    </Button>
  );
}

function formatDate(value: string) {
  return value ? new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "";
}

export function OutreachPageClient() {
  const ready = useClientReady();
  const { data, error, isLoading, mutate } = useSWR<CampaignList>("/api/leads", jsonFetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
  const campaigns = ready ? (data?.campaigns ?? []) : [];

  async function remove(campaign: OutreachCampaignCard) {
    if (!window.confirm(`Удалить кампанию «${campaign.name}» вместе с базой и логами?`)) return;
    const result = await deleteCampaign(campaign.id);
    if (!result.ok) return toast.error(result.error);
    toast.success("Кампания удалена");
    void mutate();
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-white">Лидогенерация</h1>
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
      ) : !ready ? null : isLoading && !data ? (
        <div className="mt-10 grid gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl border border-zinc-800 bg-gray-100" />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <div className="mt-16 grid place-items-center">
          <div className="grid max-w-md justify-items-center rounded-2xl border border-zinc-800 px-8 py-16 text-center">
            <Send className="size-8 text-zinc-600" strokeWidth={1.5} />
            <p className="mt-4 text-sm leading-6 text-zinc-400">Кампаний пока нет. Создайте первую, чтобы ИИ отправил персональное первое сообщение каждому контакту.</p>
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
                      <Link href={`/leads/${campaign.id}`} className="truncate font-heading text-xl font-semibold text-white hover:underline">
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
                    <CampaignControls campaign={campaign} mutate={mutate} />
                    <Button asChild>
                      <Link href={`/leads/${campaign.id}`}>Открыть</Link>
                    </Button>
                    <Button type="button" variant="outline" size="icon" className="size-10" aria-label={`Удалить ${campaign.name}`} onClick={() => void remove(campaign)}>
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

/** Тот же controlCampaign, что на вкладке «Мониторинг». Бейдж меняется сразу, откатывается, если сервер ответил ошибкой. */
function CampaignControls({ campaign, mutate }: { campaign: OutreachCampaignCard; mutate: KeyedMutator<CampaignList> }) {
  const [pending, setPending] = useState<{ action: ControlAction; from: OutreachStatus } | null>(null);
  const controllable = campaign.status === "active" || campaign.status === "paused";
  if (!controllable && !pending) return null;

  const shown = pending?.from ?? campaign.status;
  const actions: ControlAction[] = shown === "paused" ? ["start", "stop"] : ["pause", "stop"];

  async function run(action: ControlAction) {
    if (pending) return;
    setPending({ action, from: campaign.status });
    const previous = campaign.status;
    await mutate(
      (current) =>
        current && {
          campaigns: current.campaigns.map((item) => (item.id === campaign.id ? { ...item, status: NEXT_STATUS[action] } : item)),
        },
      { revalidate: false },
    );
    const result = await controlCampaign(campaign.id, action);
    if (result.ok) {
      toast.success(result.message ?? "Готово");
      void mutate();
    } else {
      toast.error(result.error);
      await mutate(
        (current) =>
          current && {
            campaigns: current.campaigns.map((item) => (item.id === campaign.id ? { ...item, status: previous } : item)),
          },
        { revalidate: true },
      );
    }
    setPending(null);
  }

  return (
    <div className="flex items-center gap-2">
      {actions.map((action) => {
        const busy = pending?.action === action;
        const play = action === "start";
        const label = play ? "Запустить" : action === "pause" ? "Пауза" : "Остановить";
        const Icon = busy ? Loader2 : play ? Play : action === "pause" ? Pause : Square;
        return (
          <Button
            key={action}
            type="button"
            size="icon"
            variant={play ? "default" : "outline"}
            className="size-10"
            disabled={pending !== null}
            aria-label={label}
            title={label}
            onClick={() => void run(action)}
          >
            <Icon className={busy ? "size-4 animate-spin" : "size-4"} />
          </Button>
        );
      })}
    </div>
  );
}
