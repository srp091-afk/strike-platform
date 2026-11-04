"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Clock3, Flame, MessagesSquare, Sparkles, Target, TrendingUp, Zap } from "lucide-react";

import { generateAIPulseReport, type PulseReport } from "@/app/actions/dashboard";
import { ChannelIcon } from "@/components/channel-icons";
import type { DashboardData, FeedItem, LoadChartData } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

/* Явные цвета: в портале светлая тема строится инверсией переменных, поэтому white/zinc здесь не используем. */
const CARD =
  "rounded-3xl border border-gray-200 bg-[#ffffff] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-12px_rgba(16,24,40,0.08)]";
const INK = "text-[#0b0b0f]";
const BRAND = "#cf0234";

type Metric = {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  /** Для дельты в пунктах (конверсия) вместо процентов. */
  deltaSuffix?: string;
  icon: typeof Target;
  points: number[];
};

const SERIES = [
  { key: "whatsapp", label: "WhatsApp", color: BRAND },
  { key: "telegram", label: "Telegram", color: "#0f172a" },
  { key: "web_widget", label: "Web-виджет", color: "#f59e0b" },
] as const;
const TONES: Record<FeedItem["status"]["tone"], string> = {
  brand: "border-rose-200 bg-rose-50 text-rose-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  gray: "border-gray-200 bg-gray-50 text-gray-600",
};

export function DashboardView({ data }: { data: DashboardData | null }) {
  const fmt = (value: number) => new Intl.NumberFormat("ru-RU").format(value);
  const empty = [0, 0, 0, 0];
  const metrics: Metric[] = [
    { label: "Квалифицировано лидов", value: data ? fmt(data.leads.value) : "—", delta: data?.leads.delta, icon: Target, points: data?.leads.points ?? empty },
    {
      label: "Сэкономлено часов",
      value: data ? `${fmt(data.hours.value)} ч` : "—",
      hint: data ? `~$${fmt(Math.round(data.hours.value * 8))} ФОТ` : undefined,
      delta: data?.hours.delta,
      icon: Clock3,
      points: data?.hours.points ?? empty,
    },
    { label: "Конверсия в лид", value: data ? `${data.conversion.value}%` : "—", delta: data?.conversion.delta, deltaSuffix: " п.п.", icon: TrendingUp, points: data?.conversion.points ?? empty },
    { label: "Всего диалогов", value: data ? fmt(data.dialogs.value) : "—", delta: data?.dialogs.delta, icon: MessagesSquare, points: data?.dialogs.points ?? empty },
  ];

  return (
    <div className="min-h-full bg-[#ffffff]">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Портал · Обзор</p>
            <h1 className={cn("mt-3 font-heading text-4xl font-bold tracking-tight sm:text-5xl", INK)}>Дашборд</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-gray-500">
              Ключевые показатели ваших AI-агентов за 30 дней: лиды, нагрузка по каналам и события в реальном времени.
            </p>
          </div>
          <Link
            href="/agents"
            className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3 text-sm font-semibold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] sm:w-auto"
          >
            Управлять агентами
            <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
          </Link>
        </header>

        {data?.error ? (
          <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{data.error}</p>
        ) : null}

        <section className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </section>

        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
          <LoadChart chart={data?.chart ?? null} />
          <PulseCard />
        </section>

        <ActivityFeed feed={data?.feed ?? null} />
      </div>
    </div>
  );
}

function DeltaBadge({ delta, suffix }: { delta: number; suffix: string }) {
  const up = delta >= 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs font-semibold",
        up ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700",
      )}
    >
      <Arrow className="size-3" strokeWidth={2.5} />
      {up ? "+" : ""}
      {delta}
      {suffix}
    </span>
  );
}

function MetricCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon;
  return (
    <div className={cn(CARD, "flex flex-col p-6")}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-gray-500">{metric.label}</p>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600">
          <Icon className="size-4" strokeWidth={2} />
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className={cn("font-heading text-4xl font-bold tracking-tight", INK)}>{metric.value}</p>
        {metric.delta != null ? <DeltaBadge delta={metric.delta} suffix={metric.deltaSuffix ?? "%"} /> : null}
      </div>
      <p className="mt-1 h-5 text-sm text-gray-500">{metric.hint ?? "за последние 30 дней"}</p>
      <Sparkline points={metric.points} />
    </div>
  );
}
function Sparkline({ points }: { points: number[] }) {
  const id = useId();
  const w = 240;
  const h = 56;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const coords = points.map((p, i) => [(i / (points.length - 1)) * w, h - 6 - ((p - min) / (max - min || 1)) * (h - 14)] as const);
  const line = smoothPath(coords);
  const [lx, ly] = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-4 h-14 w-full overflow-visible" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={BRAND} stopOpacity="0.18" />
          <stop offset="100%" stopColor={BRAND} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L ${w} ${h} L 0 ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={BRAND} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="3.5" fill="#ffffff" stroke={BRAND} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function niceStep(peak: number) {
  const raw = Math.max(peak, 3) / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / pow;
  return Math.ceil(unit <= 1 ? 1 * pow : unit <= 2 ? 2 * pow : unit <= 5 ? 5 * pow : 10 * pow);
}

function smoothPath(pts: ReadonlyArray<readonly [number, number]>) {
  return pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`;
  }, "");
}

function LoadChart({ chart }: { chart: LoadChartData | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = chart?.days ?? ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const series = SERIES.map((s) => ({ ...s, data: chart?.series[s.key]?.length === days.length ? chart.series[s.key] : days.map(() => 0) }));  const gradId = useId();
  const W = 640;
  const H = 280;
  const pad = { l: 44, r: 14, t: 16, b: 34 };
  const peak = Math.max(0, ...series.flatMap((s) => s.data));
  const step = niceStep(peak);
  const maxY = step * 3;
  const ticks = [0, step, step * 2, step * 3];
  const x = (i: number) => pad.l + (i / (days.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const totals = days.map((_, i) => series.reduce((sum, s) => sum + s.data[i], 0));
  const weekTotal = totals.reduce((a, b) => a + b, 0);
  const active = hover ?? days.length - 1;

  return (
    <div className={cn(CARD, "p-6 sm:p-8")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className={cn("font-heading text-2xl font-bold tracking-tight", INK)}>Динамика нагрузки</h2>
          <p className="mt-1 text-sm text-gray-500">Входящие обращения по каналам за неделю</p>
        </div>
        <div className="text-right">
          <p className={cn("font-heading text-3xl font-bold tracking-tight", INK)}>
            {new Intl.NumberFormat("ru-RU").format(weekTotal)}
          </p>
          <p className="text-xs text-gray-500">обращений за 7 дней</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2 text-sm text-gray-600">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
            <span className="font-semibold text-[#0b0b0f]">{s.data[active]}</span>
          </span>
        ))}
        <span className="text-sm text-gray-400">· {days[active]}</span>
      </div>

      <div className="relative mt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="График обращений по каналам за неделю">
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity="0.16" />
              <stop offset="100%" stopColor={BRAND} stopOpacity="0" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eef0f3" strokeDasharray={t === 0 ? undefined : "4 6"} />
              <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" fontSize="14" fill="#9ca3af">
                {t}
              </text>
            </g>
          ))}
          <line x1={x(active)} x2={x(active)} y1={pad.t} y2={H - pad.b} stroke="#e5e7eb" />
          <path
            d={`${smoothPath(series[0].data.map((v, i) => [x(i), y(v)] as const))} L ${x(days.length - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`}
            fill={`url(#${gradId})`}
          />
          {series.map((s) => (
            <g key={s.key}>
              <path
                d={smoothPath(s.data.map((v, i) => [x(i), y(v)] as const))}
                fill="none"
                stroke={s.color}
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx={x(active)} cy={y(s.data[active])} r="5" fill="#ffffff" stroke={s.color} strokeWidth="2.5" />
            </g>
          ))}
          {days.map((d, i) => (
            <g key={d}>
              <text x={x(i)} y={H - 8} textAnchor="middle" fontSize="14" fontWeight={i === active ? 700 : 500} fill={i === active ? "#0b0b0f" : "#9ca3af"}>
                {d}
              </text>
              <rect
                x={x(i) - 28}
                y={pad.t}
                width="56"
                height={H - pad.t - pad.b}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onTouchStart={() => setHover(i)}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

const PULSE_SLOTS = [
  { key: "trend", label: "Тренд спроса", icon: Flame, hint: "Что растёт в запросах клиентов" },
  { key: "risk", label: "Проблема / риск", icon: AlertTriangle, hint: "Где теряются клиенты" },
  { key: "trigger", label: "Успешный триггер", icon: Zap, hint: "Что работает лучше всего" },
] as const;

function PulseCard() {
  const [pending, startTransition] = useTransition();
  const [report, setReport] = useState<PulseReport | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function regenerate() {
    if (pending) return;
    setError(null);
    startTransition(async () => {
      const result = await generateAIPulseReport();
      if (result.ok) {
        setReport(result.report);
        setUpdated(new Date(result.generatedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }));
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className={cn(CARD, "flex flex-col p-6 sm:p-8")}>
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
          <Sparkles className="size-3.5" strokeWidth={2} />
          AI Executive Pulse
        </span>
        <h2 className={cn("mt-4 font-heading text-2xl font-bold tracking-tight", INK)}>AI-сводка за сегодня</h2>
        <p className="mt-1 text-sm text-gray-500">
          {updated ? `Обновлено: сегодня, ${updated}` : "По последним 80 сообщениям из диалогов"}
        </p>
      </div>

      {error ? (
        <p className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
      ) : null}

      <ul className="mt-6 flex flex-1 flex-col gap-3" aria-busy={pending}>
        {PULSE_SLOTS.map((slot) => {
          const Icon = slot.icon;
          const insight = report?.[slot.key];
          return (
            <li key={slot.key} className="flex gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-rose-100 bg-[#ffffff] text-rose-600">
                <Icon className="size-4" strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{slot.label}</p>
                {pending ? (
                  <div className="mt-2 space-y-2" aria-hidden>
                    <div className="h-3.5 w-11/12 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-gray-200" />
                  </div>
                ) : insight ? (
                  <>
                    <p className="mt-1 text-sm font-semibold leading-5 text-[#0b0b0f]">{insight.title}</p>
                    <p className="mt-1 text-sm leading-5 text-gray-500">{insight.text}</p>
                  </>
                ) : (
                  <p className="mt-1 text-sm leading-5 text-gray-500">{slot.hint}. Нажмите «Сгенерировать отчёт».</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={regenerate}
        disabled={pending}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3 text-sm font-semibold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
      >
        <Sparkles className={cn("size-4", pending && "animate-spin")} strokeWidth={2} />
        {pending ? "Анализируем диалоги…" : report ? "Обновить отчёт" : "Сгенерировать свежий отчёт"}
      </button>
    </div>
  );
}

function ActivityFeed({ feed }: { feed: FeedItem[] | null }) {
  return (
    <section className={cn(CARD, "mt-6 p-6 sm:p-8")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={cn("font-heading text-2xl font-bold tracking-tight", INK)}>Живая лента событий</h2>
          <p className="mt-1 text-sm text-gray-500">Последние обновлённые диалоги во всех каналах</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      </div>

      {feed && feed.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-500">
          Пока нет диалогов. Они появятся здесь, как только клиенты напишут вашим агентам.
        </p>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(feed ?? []).map((event) => (
            <li key={event.id}>
              <Link
                href="/chats"
                className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-[#ffffff] p-4 transition-colors hover:border-rose-200 hover:bg-rose-50/40"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-gray-200 bg-gray-50 text-[#0b0b0f]">
                  <ChannelIcon provider={event.provider} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="truncate text-sm font-semibold text-[#0b0b0f]">{event.name}</p>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", TONES[event.status.tone])}>
                      {event.status.label}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm leading-5 text-gray-500">{event.preview}</p>
                </div>
                <span className="hidden shrink-0 text-xs text-gray-400 sm:block">{event.ago}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}