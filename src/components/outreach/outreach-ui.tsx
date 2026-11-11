"use client";

import { useSyncExternalStore } from "react";

import { campaignHold, type CampaignHold } from "@/lib/outreach-schedule";
import type { OutreachLogStatus, OutreachStatus } from "@/lib/outreach-types";
import { OUTREACH_STATUS_LABEL } from "@/lib/outreach-types";
import { cn } from "@/lib/utils";

export const cardClass = "rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6";
export const fieldClass =
  "w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none transition-colors duration-200 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-white disabled:opacity-50";

const STATUS_TONE: Record<OutreachStatus, string> = {
  draft: "border-gray-200 bg-gray-100 text-gray-700",
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  paused: "border-amber-200 bg-amber-50 text-amber-700",
  completed: "border-sky-200 bg-sky-50 text-sky-700",
};

const HOLD_BADGE: Record<CampaignHold, { label: string; tone: string }> = {
  daily_limit: { label: "Суточный лимит", tone: "border-orange-200 bg-orange-50 text-orange-700" },
  outside_hours: { label: "Вне рабочего времени", tone: "border-blue-200 bg-blue-50 text-blue-700" },
};

function useClientNow() {
  return useSyncExternalStore(
    (onStoreChange) => {
      const id = setInterval(onStoreChange, 30_000);
      return () => clearInterval(id);
    },
    () => Date.now(),
    () => 0,
  );
}

export function CampaignStatusBadge({
  status,
  sentToday = 0,
  dailyLimit = 0,
  workTimeStart,
  workTimeEnd,
  timezone,
}: {
  status: OutreachStatus;
  sentToday?: number;
  dailyLimit?: number;
  workTimeStart?: string;
  workTimeEnd?: string;
  timezone?: string;
}) {
  const now = useClientNow();
  const hold =
    now > 0
      ? campaignHold({
          status,
          sentToday,
          dailyLimit,
          workTimeStart,
          workTimeEnd,
          timezone,
          now: new Date(now),
        })
      : null;
  const tone = hold ? HOLD_BADGE[hold].tone : STATUS_TONE[status];
  const label = hold ? HOLD_BADGE[hold].label : OUTREACH_STATUS_LABEL[status];
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", tone)}>{label}</span>;
}

const LOG_TONE: Record<OutreachLogStatus, { label: string; tone: string }> = {
  queued: { label: "В очереди", tone: "border-gray-200 bg-gray-100 text-gray-700" },
  success: { label: "Отправлено", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  error: { label: "Ошибка", tone: "border-rose-200 bg-rose-50 text-rose-700" },
};

export function LogStatusBadge({ status, title }: { status: OutreachLogStatus; title?: string }) {
  const { label, tone } = LOG_TONE[status];
  return (
    <span title={title} className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", tone)}>
      {label}
    </span>
  );
}

export function ProgressBar({ sent, failed, total }: { sent: number; failed: number; total: number }) {
  const done = total > 0 ? Math.round(((sent + failed) / total) * 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className="h-full rounded-full bg-strike transition-all duration-500" style={{ width: `${done}%` }} />
    </div>
  );
}
