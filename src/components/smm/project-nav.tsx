"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, CalendarDays, Clapperboard, FolderOpen, Lightbulb, Plug } from "lucide-react";

import { projectInitial } from "@/components/smm/smm-projects-view";
import { cn } from "@/lib/utils";
import type { SmmProject } from "@/lib/smm-project-types";

const TABS = [
  { slug: "integrations", label: "Интеграции", icon: Plug },
  { slug: "strategy", label: "Идеи и стратегия", icon: Lightbulb },
  { slug: "plan", label: "Контент-план", icon: CalendarDays },
  { slug: "studio", label: "AI-Видеостудия", icon: Clapperboard },
  { slug: "assets", label: "Медиатека", icon: FolderOpen },
] as const;

export function ProjectHeader({ project }: { project: SmmProject }) {
  const pathname = usePathname();
  const base = `/smm/p/${project.id}`;

  return (
    <header>
      <Link href="/smm" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-[#cf0234]">
        <ArrowLeft className="size-4" strokeWidth={2} />
        Все проекты
      </Link>
      <div className="mt-5 flex items-center gap-4">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-strike font-heading text-2xl font-bold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)]">
          {projectInitial(project.name)}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">SMM-проект</p>
          <h1 className="truncate font-heading text-3xl font-bold tracking-tight text-[#0b0b0f] sm:text-4xl">{project.name}</h1>
        </div>
      </div>

      <nav aria-label="Разделы проекта" className="mt-8 overflow-x-auto pb-1">
        <div className="inline-flex min-w-full gap-1 rounded-2xl border border-gray-200 bg-gray-50 p-1 sm:min-w-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const href = `${base}/${tab.slug}`;
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={tab.slug}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all sm:flex-none",
                  active
                    ? "bg-[#ffffff] text-rose-700 shadow-[0_1px_3px_rgba(16,24,40,0.1)] ring-1 ring-gray-200"
                    : "text-gray-500 hover:text-[#0b0b0f]",
                )}
              >
                <Icon className="size-4" strokeWidth={2} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
