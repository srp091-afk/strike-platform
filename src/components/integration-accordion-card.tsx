"use client";

import { ChevronDown, Webhook } from "lucide-react";
import { useState, type ReactNode } from "react";

export function IntegrationAccordionCard({
  title,
  description,
  connected,
  icon,
  children,
}: {
  title: string;
  description: string;
  connected: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-950"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-zinc-700 bg-zinc-900">
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-sans text-sm font-bold text-white">{title}</span>
          <span className="block truncate text-xs leading-5 text-zinc-400">{description}</span>
        </span>
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
        <ChevronDown className={`size-4 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={open ? "grid gap-4 border-t border-zinc-800 p-4 sm:p-6" : "hidden"}>{children}</div>
    </section>
  );
}

export function AmoCrmIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path
        fill="#0084FF"
        d="M12 18.4a5.4 5.4 0 0 1-5.4-5.3C6.6 10.1 9 7.8 12 7.8c1.7 0 3 .6 4 1.7l1.1-1.3h2.3v9.4h-2.4v-1.2a5.3 5.3 0 0 1-5 2Zm.3-2.2c1.7 0 2.8-1.2 2.8-3s-1.1-3-2.8-3-2.8 1.2-2.8 3 1.1 3 2.8 3Z"
      />
    </svg>
  );
}

export function PipedriveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#017737" d="M7.5 4.5h5.6a4.5 4.5 0 0 1 0 9H11v6H7.5v-15Zm3.5 6h1.7a2 2 0 0 0 0-4H11v4Z" />
    </svg>
  );
}

export function BitrixIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <text x="12" y="17" textAnchor="middle" fontSize="13" fontWeight="700" fill="#2FC6F6" fontFamily="Inter, Arial, sans-serif">
        24
      </text>
    </svg>
  );
}

export function GoogleCalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" fill="#fff" />
      <path d="M5 5h14a2 2 0 0 1 2 2v2H3V7a2 2 0 0 1 2-2Z" fill="#1A73E8" />
      <rect x="6.5" y="3" width="2" height="4" rx="1" fill="#EA4335" />
      <rect x="15.5" y="3" width="2" height="4" rx="1" fill="#FBBC04" />
      <rect x="6" y="12" width="3.2" height="3.2" rx="0.4" fill="#34A853" />
      <rect x="10.4" y="12" width="3.2" height="3.2" rx="0.4" fill="#4285F4" />
      <rect x="14.8" y="12" width="3.2" height="3.2" rx="0.4" fill="#EA4335" />
    </svg>
  );
}

export function WebhookIcon() {
  return <Webhook className="size-4 text-zinc-100" strokeWidth={2} aria-hidden />;
}
