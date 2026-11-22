"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

/** Плоская строка настроек в том же виде, что каналы и интеграции. Поля остаются в DOM и в свёрнутом виде. */
export function BehaviorAccordion({
  title,
  description,
  status,
  active = false,
  plain = false,
  icon,
  children,
}: {
  title: string;
  description: string;
  status: string;
  active?: boolean;
  /** Для значения вроде «1 час» не превращать подпись в капс. */
  plain?: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border-b border-zinc-800 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full cursor-pointer items-center gap-3 px-1 py-3 text-left transition-colors duration-150 hover:bg-zinc-900"
      >
        <span className="grid size-9 shrink-0 place-items-center">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-sans text-sm font-bold text-white">{title}</span>
          <span className="block truncate text-xs leading-5 text-zinc-400">{description}</span>
        </span>
        <span
          className={
            active
              ? `inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-400 ${plain ? "" : "uppercase"}`
              : `inline-flex shrink-0 items-center gap-1.5 rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-zinc-400 ${plain ? "" : "uppercase"}`
          }
        >
          <span className={`size-1.5 rounded-full ${active ? "bg-emerald-400" : "bg-zinc-500"}`} />
          {status}
        </span>
        <ChevronDown className={`size-4 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div hidden={!open} className={open ? "grid gap-5 px-1 pt-1 pb-6" : undefined}>
        {children}
      </div>
    </section>
  );
}

export function BehaviorIcon({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`grid size-9 place-items-center rounded-lg ${tone}`}>{children}</span>;
}
