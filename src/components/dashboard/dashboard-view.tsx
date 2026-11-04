"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ArrowRight, ArrowUpRight, Clock3, MessagesSquare, Sparkles, Target, TrendingUp } from "lucide-react";

import { ChannelIcon } from "@/components/channel-icons";
import type { IntegrationProvider } from "@/lib/integration-catalog";
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
  badge?: string;
  badgeTone?: "up" | "neutral";
  icon: typeof Target;
  points: number[];
};

const WEEK = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const SERIES = [
  { key: "whatsapp", label: "WhatsApp", color: BRAND, data: [182, 214, 238, 226, 271, 196, 168] },
  { key: "telegram", label: "Telegram", color: "#0f172a", data: [96, 118, 124, 139, 151, 112, 94] },
  { key: "web", label: "Web-виджет", color: "#f59e0b", data: [58, 72, 91, 84, 110, 79, 66] },
] as const;

type FeedEvent = {
  channel: IntegrationProvider;
  name: string;
  action: string;
  time: string;
  tag: string;
  tone: "brand" | "green" | "amber" | "gray";
};

const FEED: FeedEvent[] = [
  { channel: "whatsapp", name: "+7 916 ••• 42 18", action: "Оставил заявку на аудит рекламного кабинета", time: "только что", tag: "Лид", tone: "brand" },
  { channel: "telegram", name: "@anna_marketing", action: "Переведена на оператора после вопроса о тарифах", time: "2 мин назад", tag: "Оператор", tone: "amber" },
  { channel: "widget", name: "Посетитель сайта #4821", action: "Запросил демо-доступ к платформе", time: "7 мин назад", tag: "Демо", tone: "green" },
  { channel: "whatsapp", name: "Дмитрий К.", action: "Завершил квалификацию: бюджет от $2 000 в месяц", time: "14 мин назад", tag: "Квалифицирован", tone: "green" },
  { channel: "telegram", name: "@oleg_shop", action: "Спросил про интеграцию с CRM", time: "26 мин назад", tag: "Диалог", tone: "gray" },
  { channel: "instagram", name: "@studio.mira", action: "Написал в директ: интересует запуск рассылок", time: "41 мин назад", tag: "Диалог", tone: "gray" },
];

const TONES: Record<FeedEvent["tone"], string> = {
  brand: "border-rose-200 bg-rose-50 text-rose-700",
  green: "border-emerald-200 bg-emerald-50 text-emerald-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  gray: "border-gray-200 bg-gray-50 text-gray-600",
};

export function DashboardView({ dialogs, error }: { dialogs: number; error?: string | null }) {
  const metrics: Metric[] = [
    { label: "Квалифицировано лидов", value: "24", badge: "+18%", badgeTone: "up", icon: Target, points: [6, 9, 8, 12, 11, 16, 15, 20, 24] },
    { label: "Сэкономлено часов", value: "155 ч", hint: "~$1,200 ФОТ", icon: Clock3, points: [10, 14, 13, 19, 22, 21, 27, 31, 34] },
    { label: "Конверсия в лид", value: "14.2%", badge: "+2.4 п.п.", badgeTone: "up", icon: TrendingUp, points: [9, 11, 10, 12, 11, 13, 12, 14, 14.2] },
    { label: "Всего диалогов", value: new Intl.NumberFormat("ru-RU").format(dialogs), hint: "из базы данных", icon: MessagesSquare, points: [3, 5, 4, 7, 8, 8, 11, 12, 14] },
  ];

  return (
    <div className="min-h-full bg-[#ffffff]">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Портал · Обзор</p>
            <h1 className={cn("mt-3 font-heading text-4xl font-bold tracking-tight sm:text-5xl", INK)}>Дашборд</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-gray-500">
              Ключевые показатели ваших AI-агентов: лиды, нагрузка по каналам и события в реальном времени.
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

        {error ? (
          <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
        ) : null}

        <section className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <MetricCard key={metric.label} metric={metric} />
          ))}
        </section>

        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,65fr)_minmax(0,35fr)]">
          <LoadChart />
          <PulseCard />
        </section>

        <ActivityFeed />
      </div>
    </div>
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
        {metric.badge ? (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            <ArrowUpRight className="size-3" strokeWidth={2.5} />
            {metric.badge}
          </span>
        ) : null}
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

function smoothPath(pts: ReadonlyArray<readonly [number, number]>) {
  return pts.reduce((acc, [x, y], i) => {
    if (i === 0) return `M ${x} ${y}`;
    const [px, py] = pts[i - 1];
    const cx = (px + x) / 2;
    return `${acc} C ${cx} ${py}, ${cx} ${y}, ${x} ${y}`;
  }, "");
}

function LoadChart() {
  const [hover, setHover] = useState<number | null>(null);
  const gradId = useId();
  const W = 640;
  const H = 280;
  const pad = { l: 44, r: 14, t: 16, b: 34 };
  const maxY = 300;
  const x = (i: number) => pad.l + (i / (WEEK.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const totals = WEEK.map((_, i) => SERIES.reduce((sum, s) => sum + s.data[i], 0));
  const weekTotal = totals.reduce((a, b) => a + b, 0);
  const active = hover ?? 4;

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
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2 text-sm text-gray-600">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
            <span className="font-semibold text-[#0b0b0f]">{s.data[active]}</span>
          </span>
        ))}
        <span className="text-sm text-gray-400">· {WEEK[active]}</span>
      </div>

      <div className="relative mt-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="График обращений по каналам за неделю">
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={BRAND} stopOpacity="0.16" />
              <stop offset="100%" stopColor={BRAND} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 100, 200, 300].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#eef0f3" strokeDasharray={t === 0 ? undefined : "4 6"} />
              <text x={pad.l - 10} y={y(t) + 4} textAnchor="end" fontSize="14" fill="#9ca3af">
                {t}
              </text>
            </g>
          ))}
          <line x1={x(active)} x2={x(active)} y1={pad.t} y2={H - pad.b} stroke="#e5e7eb" />
          <path
            d={`${smoothPath(SERIES[0].data.map((v, i) => [x(i), y(v)] as const))} L ${x(6)} ${y(0)} L ${x(0)} ${y(0)} Z`}
            fill={`url(#${gradId})`}
          />
          {SERIES.map((s) => (
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
          {WEEK.map((d, i) => (
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

const INSIGHTS = [
  { icon: "🔥", title: "Спрос на услугу «Аудит рекламы» вырос на 30%", text: "Основной приток — WhatsApp, вечернее окно 19–22 ч." },
  { icon: "⚠️", title: "3 клиента ждут ответа живого менеджера", text: "Самое долгое ожидание — 12 минут в Telegram." },
  { icon: "✅", title: "Конверсия оффера «Пробный период» выше базовой", text: "9.8% против среднего 6.1% по остальным офферам." },
];

function PulseCard() {
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState("сегодня, 09:00");

  function regenerate() {
    if (busy) return;
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setUpdated(`сегодня, ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`);
    }, 1400);
  }

  return (
    <div className={cn(CARD, "flex flex-col p-6 sm:p-8")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
            <Sparkles className="size-3.5" strokeWidth={2} />
            AI Executive Pulse
          </span>
          <h2 className={cn("mt-4 font-heading text-2xl font-bold tracking-tight", INK)}>AI-сводка за сегодня</h2>
          <p className="mt-1 text-sm text-gray-500">Обновлено: {updated}</p>
        </div>
      </div>

      <ul className="mt-6 flex flex-1 flex-col gap-3">
        {INSIGHTS.map((item) => (
          <li key={item.title} className="flex gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <span className="text-lg leading-6" aria-hidden>
              {item.icon}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-5 text-[#0b0b0f]">{item.title}</p>
              <p className="mt-1 text-sm leading-5 text-gray-500">{item.text}</p>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={regenerate}
        disabled={busy}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3 text-sm font-semibold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-70"
      >
        <Sparkles className={cn("size-4", busy && "animate-pulse")} strokeWidth={2} />
        {busy ? "Анализируем диалоги…" : "Сгенерировать свежий отчёт"}
      </button>
    </div>
  );
}

function ActivityFeed() {
  return (
    <section className={cn(CARD, "mt-6 p-6 sm:p-8")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className={cn("font-heading text-2xl font-bold tracking-tight", INK)}>Живая лента событий</h2>
          <p className="mt-1 text-sm text-gray-500">Последние действия клиентов во всех каналах</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      </div>

      <ul className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
        {FEED.map((event) => (
          <li
            key={`${event.name}-${event.time}`}
            className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-[#ffffff] p-4 transition-colors hover:border-rose-200 hover:bg-rose-50/40"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-gray-200 bg-gray-50 text-[#0b0b0f]">
              <ChannelIcon provider={event.channel} className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="truncate text-sm font-semibold text-[#0b0b0f]">{event.name}</p>
                <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", TONES[event.tone])}>{event.tag}</span>
              </div>
              <p className="mt-0.5 text-sm leading-5 text-gray-500">{event.action}</p>
            </div>
            <span className="hidden shrink-0 text-xs text-gray-400 sm:block">{event.time}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
