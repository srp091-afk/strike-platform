"use client";

import { Download, FlaskConical, Pause, Play, Square } from "lucide-react";
import { useState, useTransition } from "react";

import { controlCampaign } from "@/app/leads/actions";
import { LogStatusBadge, ProgressBar, cardClass } from "@/components/outreach/outreach-ui";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import type { OutreachCampaign, OutreachCounts, OutreachLog } from "@/lib/outreach-types";

type SandboxResponse = {
  error?: string;
  ok?: boolean;
  message?: string;
  contact?: Record<string, string>;
  steps?: Array<{ label: string; ok: boolean; detail?: string }>;
};

function formatTime(value: string | null) {
  return value ? new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

export function OutreachMonitor({
  campaign,
  logs,
  counts,
  onChanged,
}: {
  campaign: OutreachCampaign;
  logs: OutreachLog[];
  counts: OutreachCounts;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandbox, setSandbox] = useState<SandboxResponse | null>(null);

  function control(action: "start" | "pause" | "stop") {
    startTransition(async () => {
      const result = await controlCampaign(campaign.id, action);
      if (result.ok) toast.success(result.message ?? "Готово");
      else toast.error(result.error);
      onChanged();
    });
  }

  async function runSandbox() {
    setSandboxLoading(true);
    setSandbox(null);
    try {
      const response = await fetch(`/api/leads/${campaign.id}/sandbox`, { method: "POST" });
      setSandbox((await response.json()) as SandboxResponse);
    } catch {
      setSandbox({ error: "Не удалось связаться с сервером." });
    } finally {
      setSandboxLoading(false);
    }
  }

  const active = campaign.status === "active";
  const columns = campaign.source_columns;

  return (
    <div className="grid gap-6">
      <section className={cardClass}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">
              {counts.sent}/{counts.total} отправлено
              {counts.failed > 0 ? <span className="ml-2 text-xs font-normal text-rose-600">ошибок: {counts.failed}</span> : null}
            </p>
            <div className="mt-2 max-w-md">
              <ProgressBar sent={counts.sent} failed={counts.failed} total={counts.total} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending || active} onClick={() => control("start")}>
              <Play className="size-4" /> {campaign.status === "paused" ? "Продолжить" : "Запустить"}
            </Button>
            <Button type="button" variant="outline" disabled={pending || !active} onClick={() => control("pause")}>
              <Pause className="size-4" /> Пауза
            </Button>
            <Button type="button" variant="outline" disabled={pending || !(active || campaign.status === "paused")} onClick={() => control("stop")}>
              <Square className="size-4" /> Остановить
            </Button>
            <Button type="button" variant="outline" disabled={sandboxLoading || counts.total === 0} onClick={() => void runSandbox()}>
              <FlaskConical className="size-4" /> {sandboxLoading ? "Генерируем..." : "Сгенерировать тест"}
            </Button>
            <Button asChild variant="outline">
              <a href={`/api/leads/${campaign.id}/export`} download>
                <Download className="size-4" /> Экспорт отчёта
              </a>
            </Button>
          </div>
        </div>

        {sandbox ? (
          <div className="mt-5 rounded-xl border border-zinc-800 bg-black/40 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Песочница · без отправки</p>
            {sandbox.steps?.length ? (
              <ul className="mt-3 grid gap-1 text-sm">
                {sandbox.steps.map((step, index) => (
                  <li key={index} className={step.ok ? "text-emerald-700" : "text-rose-700"}>
                    {step.ok ? "✓" : "✕"} {step.label}
                    {step.detail ? <span className="text-zinc-400"> — {step.detail}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {sandbox.message ? (
              <p className="mt-3 whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm leading-6 text-white">{sandbox.message}</p>
            ) : null}
            {sandbox.error ? <p className="mt-3 text-sm text-rose-700">{sandbox.error}</p> : null}
          </div>
        ) : null}
      </section>

      <section className={`${cardClass} !p-0 overflow-hidden`}>
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="font-heading text-lg font-semibold text-white">База и статусы</h2>
          {counts.total > logs.length ? <span className="text-xs text-zinc-400">Показаны первые {logs.length} из {counts.total}</span> : null}
        </div>
        {logs.length === 0 ? (
          <p className="border-t border-zinc-800 px-6 py-10 text-sm text-zinc-400">
            База пуста. Загрузите файл во вкладке «Настройки», и контакты появятся здесь.
          </p>
        ) : (
          <div className="max-h-[560px] overflow-auto border-t border-zinc-800">
            <table className="w-full min-w-max text-left text-sm">
              <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wider text-zinc-400">
                <tr>
                  {columns.map((column) => (
                    <th key={column} className="whitespace-nowrap px-4 py-3 font-medium">
                      {column}
                    </th>
                  ))}
                  <th className="whitespace-nowrap border-l border-zinc-800 px-4 py-3 font-semibold text-strike">STRIKE_Status</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-strike">STRIKE_Sent_Time</th>
                  <th className="whitespace-nowrap px-4 py-3 font-semibold text-strike">STRIKE_Message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {logs.map((log) => (
                  <tr key={log.id} className="align-top">
                    {columns.map((column) => (
                      <td key={column} className="max-w-[220px] truncate px-4 py-3 text-zinc-300" title={log.contact_data[column]}>
                        {log.contact_data[column] || "—"}
                      </td>
                    ))}
                    <td className="border-l border-zinc-800 px-4 py-3">
                      <LogStatusBadge status={log.strike_status} title={log.strike_error ?? undefined} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-zinc-400" suppressHydrationWarning>
                      {formatTime(log.strike_sent_time)}
                    </td>
                    <td className="min-w-[280px] max-w-[420px] px-4 py-3 text-zinc-300">
                      {log.strike_status === "error" ? (
                        <span className="text-rose-700">{log.strike_error ?? "Ошибка"}</span>
                      ) : (
                        <span className="line-clamp-3 whitespace-pre-wrap">{log.strike_message ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
