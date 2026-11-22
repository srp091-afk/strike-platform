"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Switch } from "@/components/ui/switch";

export function ChannelAccordionCard({
  title,
  description,
  connected,
  icon,
  enabled,
  onEnabledChange,
  switchDisabled = false,
  switchTitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  connected: boolean;
  icon: ReactNode;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  switchDisabled?: boolean;
  switchTitle?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-zinc-700 bg-zinc-900 text-white">
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-sans text-sm font-bold text-white">{title}</span>
            <span className="block truncate text-xs leading-5 text-zinc-400">{description}</span>
          </span>
        </button>
        <span
          className={
            connected
              ? "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400"
              : "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400"
          }
        >
          <span className={`size-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-zinc-500"}`} />
          {connected ? "Подключено" : "Не подключено"}
        </span>
        <span
          className="shrink-0"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Switch
            checked={enabled}
            disabled={switchDisabled}
            title={switchTitle}
            aria-label={title}
            onCheckedChange={onEnabledChange}
          />
        </span>
        <button
          type="button"
          aria-label={open ? "Свернуть" : "Развернуть"}
          onClick={() => setOpen((current) => !current)}
          className="grid size-8 shrink-0 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-950 hover:text-white"
        >
          <ChevronDown className={`size-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      <div hidden={!open} className={open ? "grid gap-4 border-t border-zinc-800 p-4 sm:p-6" : undefined}>
        {children}
      </div>
    </section>
  );
}
