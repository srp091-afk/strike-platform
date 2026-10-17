import type { Metadata } from "next";
import { io } from "next/cache";
import { Suspense } from "react";
import { Clock, FolderPlus } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const metadata: Metadata = {
  title: "AI-Кампании",
};

const creativePool = [
  "photo-1618005182384-a83a8bd57fbe",
  "photo-1557683316-973673baf926",
  "photo-1618556450994-a6a128ef0d9d",
  "photo-1579546929518-9e396f3cc809",
  "photo-1542744173-8e7e53415bb0",
  "photo-1460925895917-afdab827c52f",
  "photo-1551288049-bebda4e38f71",
  "photo-1523475472560-d2df97ec485c",
];

const visibleCreatives = 6;

type AdProject = {
  id: string;
  name: string;
  createdAt: string | null;
};

export default function AdsPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-bold text-white">AI-Кампании</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Создавайте и запускайте прибыльные рекламные кампании в Meta, Google и TikTok с помощью ИИ-автоматизации.
          </p>
        </div>
        <Button asChild className="shrink-0 bg-white text-black hover:bg-zinc-200 hover:shadow-none">
          <Link href="/ads/new">+ Новый проект</Link>
        </Button>
      </header>

      <Suspense fallback={<div className="mt-10 h-48 rounded-2xl border border-zinc-800 bg-zinc-900/40" />}>
        <AdsList />
      </Suspense>
    </div>
  );
}

async function AdsList() {
  await io();

  let projects: AdProject[] = [];
  let error: string | null = null;
  try {
    const userId = await getAuthenticatedUserId();
    projects = await listAdProjects(userId);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Не удалось загрузить проекты.";
  }

  if (error) {
    return (
      <p className="mt-10 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">{error}</p>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="mt-16 grid place-items-center">
        <div className="grid max-w-md justify-items-center rounded-2xl border border-zinc-800 px-8 py-16 text-center">
          <FolderPlus className="size-8 text-zinc-600" strokeWidth={1.5} />
          <p className="mt-4 text-lg font-medium text-white">У вас пока нет AI-кампаний</p>
          <Button asChild className="mt-6">
            <Link href="/ads/new">Создать первую стратегию</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ul className="mt-10 flex flex-col gap-4">
      {projects.map((project, index) => (
        <li key={project.id}>
          <ProjectCard project={project} index={index} />
        </li>
      ))}
    </ul>
  );
}

function ProjectCard({ project, index }: { project: AdProject; index: number }) {
  const creatives = mockCreatives(index);
  const shown = creatives.slice(0, visibleCreatives);
  const extra = creatives.length - shown.length;

  return (
    <Card className="flex flex-col justify-between gap-6 border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-md sm:p-6 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-medium text-white">{project.name}</h2>
        <p className="mt-1 text-sm text-zinc-400">Генерация лидов на холодную аудиторию</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <p className="text-zinc-500">Обновлено: {formatUpdated(project.createdAt)}</p>
          <p className="inline-flex items-center gap-1.5 text-zinc-300">
            <Clock className="size-3.5" strokeWidth={2} />
            Рекомендуемая замена креативов: через 3 дня
          </p>
        </div>
        <Button asChild variant="dark" className="mt-5">
          <Link href={`/ads/${project.id}`}>Открыть проект</Link>
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-2 sm:flex sm:justify-end">
        {shown.map((src, thumbIndex) => {
          const overflow = thumbIndex === shown.length - 1 && extra > 0;
          return (
            <div
              key={src}
              className="relative aspect-[5/6] overflow-hidden rounded-md border border-zinc-800 sm:aspect-auto sm:h-24 sm:w-24"
            >
              <img src={src} alt="" className="h-full w-full object-cover" />
              {overflow ? (
                <span className="absolute inset-0 grid place-items-center bg-black/60 text-sm font-medium text-white">
                  +{extra}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function mockCreatives(seed: number) {
  return Array.from({ length: 18 }, (_, offset) => {
    const id = creativePool[(seed + offset) % creativePool.length];
    return `https://images.unsplash.com/${id}?auto=format&fit=crop&w=240&h=288&q=70&sig=${seed}-${offset}`;
  });
}

function formatUpdated(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

async function listAdProjects(userId: string): Promise<AdProject[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ad_projects")
    .select("id, name, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: typeof row.name === "string" && row.name.trim() ? row.name : "Без названия",
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  }));
}
