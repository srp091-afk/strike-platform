import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { io } from "next/cache";
import { Bot, MessageSquare, MessagesSquare } from "lucide-react";

import { PageFrame } from "@/components/page-frame";
import { getDashboardCounts } from "@/lib/agents";

export const metadata: Metadata = {
  title: "Дашборд",
};

const card = [
  {
    title: "Агенты",
    text: "Системный промпт, модель и каналы. У каждого агента свой номер и свой бот.",
    href: "/agents",
    icon: Bot,
  },
  {
    title: "Чаты",
    text: "Входящие диалоги из подключённых каналов.",
    href: "/chats",
    icon: MessagesSquare,
  },
];

const metricIcons = {
  Агенты: Bot,
  Чаты: MessagesSquare,
  Сообщения: MessageSquare,
} as const;

const cardClass =
  "rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-md transition-colors duration-200 hover:border-zinc-700";

export default function DashboardPage() {
  return (
    <PageFrame
      eyebrow="Портал"
      title="Дашборд"
      description="Счётчики читаются из Supabase: агенты, чаты и сообщения."
    >
      <Suspense fallback={<MetricsSkeleton />}>
        <LiveMetrics />
      </Suspense>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Разделы</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          {card.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cardClass}>
                <span className="inline-flex rounded-xl border border-zinc-800 bg-black p-2.5 text-white">
                  <Icon className="size-5" strokeWidth={2} />
                </span>
                <span className="mt-4 block font-heading text-lg font-semibold tracking-tight text-white">
                  {item.title}
                </span>
                <span className="mt-1 block text-sm leading-6 text-zinc-400">{item.text}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </PageFrame>
  );
}

async function LiveMetrics() {
  await io();
  const counts = await getDashboardCounts();
  const metrics = [
    { value: counts.agents, label: "Агенты" as const, href: "/agents" },
    { value: counts.chats, label: "Чаты" as const, href: "/chats" },
    { value: counts.messages, label: "Сообщения" as const, href: "/chats" },
  ];

  return (
    <div>
      {counts.error ? (
        <p className="mb-4 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">
          {counts.error}
        </p>
      ) : null}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {metrics.map((metric) => {
          const Icon = metricIcons[metric.label];
          return (
            <Link key={metric.label} href={metric.href} className={cardClass}>
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium text-zinc-400">{metric.label}</p>
                <span className="rounded-xl border border-zinc-800 bg-black p-2.5 text-white">
                  <Icon className="size-5" strokeWidth={2} />
                </span>
              </div>
              <p className="mt-4 font-heading text-3xl font-bold tracking-tight text-white">
                {metric.value}
              </p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className={cardClass}>
          <div className="h-10 w-10 rounded-xl bg-zinc-800" />
          <p className="mt-4 font-heading text-3xl font-bold tracking-tight text-zinc-700">0</p>
          <p className="mt-2 text-sm text-zinc-400">Загрузка</p>
        </div>
      ))}
    </div>
  );
}
