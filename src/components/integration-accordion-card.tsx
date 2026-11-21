"use client";

import { ChevronDown, MessageSquare, Webhook } from "lucide-react";
import { useState, type ReactNode } from "react";

export function IntegrationAccordionCard({
  title,
  description,
  connected,
  icon,
  children,
  showStatus = true,
}: {
  title: string;
  description: string;
  connected: boolean;
  icon: ReactNode;
  children: ReactNode;
  /** Для настроек без подключения бейдж «Не подключено» не нужен. */
  showStatus?: boolean;
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
        {showStatus ? (
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
        ) : null}
        <ChevronDown className={`size-4 shrink-0 text-zinc-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <div hidden={!open} className={open ? "grid gap-4 border-t border-zinc-800 p-4 sm:p-6" : undefined}>
        {children}
      </div>
    </section>
  );
}

export function PaymentNoticeIcon() {
  return <MessageSquare className="size-4 text-zinc-100" strokeWidth={2} aria-hidden />;
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

export function YclientsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#FFD100" d="M4.5 4.5h4.4l3.1 6.6 3.1-6.6h4.4L13.2 14v5.5h-2.4V14L4.5 4.5Z" />
    </svg>
  );
}

export function StripeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#635BFF" d="M12.4 5.2c-2.5 0-4.1 1.2-4.1 3.2 0 2.5 3.6 3.1 3.6 4.3 0 .5-.5.8-1.4.8-1.3 0-2.8-.5-3.9-1.2l-.7 2.4c1.1.7 2.8 1.2 4.6 1.2 2.7 0 4.4-1.3 4.4-3.3 0-2.7-3.7-3.2-3.7-4.4 0-.4.4-.7 1.2-.7 1.1 0 2.4.4 3.3 1l.7-2.3c-.9-.6-2.3-1-3.6-1Z" />
    </svg>
  );
}

export function YookassaIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#0066FF" d="M7 5.5h6.2c2.6 0 4.3 1.5 4.3 3.8 0 2.4-1.8 3.9-4.4 3.9H10v5.3H7V5.5Zm3 5.5h2.8c1.1 0 1.8-.6 1.8-1.6S13.9 7.8 12.8 7.8H10v3.2Z" />
    </svg>
  );
}

export function ProdamusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#111827" d="M7 4.5h6.1c2.8 0 4.6 1.6 4.6 4.1 0 2.6-1.9 4.2-4.7 4.2H10V19.5H7V4.5Zm3 6.2h2.7c1.2 0 1.9-.6 1.9-1.6s-.7-1.6-1.9-1.6H10v3.2Z" />
      <circle cx="17.4" cy="17.6" r="1.6" fill="#21A038" />
    </svg>
  );
}

export function DikidiIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
      <path fill="#FF4B2B" d="M7.5 4h5.4a5.1 5.1 0 0 1 0 10.2H10.5V20H7.5V4Zm3 7.2h2.2a2.1 2.1 0 0 0 0-4.2H10.5v4.2Z" />
      <circle cx="17.2" cy="18.4" r="1.7" fill="#FF4B2B" />
    </svg>
  );
}
