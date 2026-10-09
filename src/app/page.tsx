import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { io } from "next/cache";
import { Bot, MessageSquare, MessagesSquare, Plug } from "lucide-react";

import { PageFrame } from "@/components/page-frame";
import { getDashboardCounts } from "@/lib/agents";

export const metadata: Metadata = {
  title: "Дашборд",
};

const card = [
  {
    title: "Агенты",
    text: "Системный промпт, модель и температура. Один агент — один стиль ответа.",
    href: "/agents",
    icon: Bot,
  },
  {
    title: "Интеграции",
    text: "WhatsApp через GreenAPI, Instagram Direct и Telegram.",
    href: "/integrations",
    icon: Plug,
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
  Интеграции: Plug,
  Чаты: MessagesSquare,
  Сообщения: MessageSquare,
} as const;

const cardClass =
  "rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] transition-all duration-200 hover:shadow-md";

export default function DashboardPage() {
  return (
    <PageFrame
      eyebrow="Портал"
      title="Дашборд"
      description="Счётчики читаются из Supabase: агенты, интеграции, чаты и сообщения."
    >
      <Suspense fallback={<MetricsSkeleton />}>
        <LiveMetrics />
      </Suspense>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Разделы</h2>
        <div className="mt-4 grid gap-6 md:grid-cols-3">
          {card.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={cardClass}>
                <span className="inline-flex rounded-xl bg-red-50 p-2.5 text-red-600">
                  <Icon className="size-5" strokeWidth={2} />
                </span>
                <span className="mt-4 block font-heading text-lg font-semibold tracking-tight text-zinc-900">
                  {item.title}
                </span>
                <span className="mt-1 block text-sm leading-6 text-zinc-500">{item.text}</span>
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
    { value: counts.integrations, label: "Интеграции" as const, href: "/integrations" },
    { value: counts.chats, label: "Чаты" as const, href: "/chats" },
    { value: counts.messages, label: "Сообщения" as const, href: "/chats" },
  ];

  return (
    <div>
      {counts.error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {counts.error}
        </p>
      ) : null}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metricIcons[metric.label];
          return (
            <Link key={metric.label} href={metric.href} className={cardClass}>
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-medium text-zinc-500">{metric.label}</p>
                <span className="rounded-xl bg-red-50 p-2.5 text-red-600">
                  <Icon className="size-5" strokeWidth={2} />
                </span>
              </div>
              <p className="mt-4 font-heading text-3xl font-bold tracking-tight text-zinc-900">
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
    <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className={cardClass}>
          <div className="h-10 w-10 rounded-xl bg-zinc-100" />
          <p className="mt-4 font-heading text-3xl font-bold tracking-tight text-zinc-200">0</p>
          <p className="mt-2 text-sm text-zinc-400">Загрузка</p>
        </div>
      ))}
    </div>
  );
}
