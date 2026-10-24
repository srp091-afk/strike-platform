"use client";

import Link from "next/link";
import { ArrowRight, Check, Zap } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

const ANNUAL_DISCOUNT = 0.2;

type Plan = {
  id: "starter" | "pro" | "agency";
  name: string;
  monthly: number;
  blurb: string;
  features: string[];
  popular?: boolean;
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    monthly: 49,
    blurb: "For founders launching their first AI-powered sales funnel.",
    features: ["150 AI campaigns", "3 AI agents", "2,500 messages / month", "3 AI websites", "All channels included"],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 99,
    blurb: "For growing teams that want automation to carry the load.",
    popular: true,
    features: [
      "500 AI campaigns",
      "10 AI agents",
      "10,000 messages / month",
      "10 AI websites",
      "All channels included",
      "Team collaboration (up to 3 users)",
    ],
  },
  {
    id: "agency",
    name: "Agency",
    monthly: 499,
    blurb: "For agencies scaling client work across many brands.",
    features: [
      "Unlimited AI agents, websites and campaigns",
      "100,000 messages / month (Fair Use)",
      "White-label: remove the watermark",
      "API & Webhooks",
      "All channels included",
    ],
  },
];

function perMonth(plan: Plan, annual: boolean) {
  return annual ? Math.round(plan.monthly * (1 - ANNUAL_DISCOUNT)) : plan.monthly;
}

function perYear(plan: Plan) {
  return Math.round(plan.monthly * 12 * (1 - ANNUAL_DISCOUNT));
}

/** Плавное появление блока при попадании во вьюпорт (без внешних библиотек). */
function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none",
        shown ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Подсветка границы и фона следом за курсором: позиция уходит в CSS-переменные. */
function trackPointer(event: MouseEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
  event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
}

function comingSoon(name: string) {
  toast.success(`${name}: checkout is coming soon. Billing opens shortly.`);
}

export function PricingView() {
  const [annual, setAnnual] = useState(false);

  return (
    <div className="relative isolate overflow-hidden bg-black text-zinc-400">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(129,140,248,0.22),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]"
      />

      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="text-sm font-medium uppercase tracking-[0.18em] text-white">
          STRIKE
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-zinc-200 backdrop-blur transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
        >
          Sign in
        </Link>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-24 sm:px-6 sm:pt-24">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-zinc-300 backdrop-blur">
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            Pricing
          </p>
          <h1 className="mt-6 bg-gradient-to-b from-white to-zinc-500 bg-clip-text pb-2 text-5xl leading-[1.15] font-semibold tracking-tight text-transparent sm:text-6xl">
            Simple, transparent pricing
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
            Start with pay-as-you-go, then scale to thousands of AI conversations across every channel. No hidden fees,
            no contracts. Upgrade the moment your pipeline demands it.
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-10 flex items-center justify-center gap-3">
          <BillingToggle annual={annual} onChange={setAnnual} />
          <span
            className={cn(
              "rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 shadow-[0_0_20px_-6px_rgba(52,211,153,0.7)] transition-opacity",
              annual ? "opacity-100" : "opacity-70",
            )}
          >
            Save 20%
          </span>
        </Reveal>

        <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
          {PLANS.map((plan, index) => (
            <Reveal key={plan.id} delay={index * 110} className="h-full">
              <PlanCard plan={plan} annual={annual} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={150} className="mt-6">
          <FlexBanner />
        </Reveal>

        <Reveal className="mt-14 text-center">
          <p className="text-sm text-zinc-500">
            All prices in USD. Annual billing is charged once per year at a 20% discount. Cancel any time.
          </p>
        </Reveal>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-600">
        &copy; STRIKE. All rights reserved.
      </footer>
    </div>
  );
}

function BillingToggle({ annual, onChange }: { annual: boolean; onChange: (annual: boolean) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Billing period"
      className="relative grid grid-cols-2 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-white shadow-[0_0_24px_-4px_rgba(255,255,255,0.45)] transition-transform duration-300 ease-out",
          annual && "translate-x-full",
        )}
      />
      {[
        { label: "Monthly", value: false },
        { label: "Annually", value: true },
      ].map((option) => (
        <button
          key={option.label}
          type="button"
          role="radio"
          aria-checked={annual === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "relative z-10 min-w-28 rounded-full px-5 py-2 text-sm font-medium transition-colors duration-300",
            annual === option.value ? "text-black" : "text-zinc-400 hover:text-white",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PlanCard({ plan, annual }: { plan: Plan; annual: boolean }) {
  const price = perMonth(plan, annual);
  const highlighted = plan.popular === true;

  return (
    <div
      onMouseMove={trackPointer}
      style={{ "--mx": "50%", "--my": "0%" } as CSSProperties}
      className={cn(
        "group relative h-full rounded-2xl p-px transition-transform duration-300 ease-out hover:-translate-y-1",
        highlighted
          ? "bg-gradient-to-b from-white/50 via-indigo-300/30 to-white/5 shadow-[0_0_80px_-20px_rgba(129,140,248,0.65)] lg:scale-[1.03]"
          : "bg-white/10",
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: "radial-gradient(320px circle at var(--mx) var(--my), rgba(165,180,252,0.7), transparent 70%)",
        }}
      />
      <div className="relative flex h-full flex-col overflow-hidden rounded-[15px] bg-[#0a0a0a]/90 p-7 backdrop-blur-xl">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background: "radial-gradient(420px circle at var(--mx) var(--my), rgba(129,140,248,0.12), transparent 65%)",
          }}
        />
        {highlighted ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-indigo-400/20 blur-3xl"
          />
        ) : null}

        <div className="relative flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
          {highlighted ? (
            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold tracking-wide text-black shadow-[0_0_20px_-2px_rgba(255,255,255,0.6)]">
              Most Popular
            </span>
          ) : null}
        </div>
        <p className="relative mt-2 min-h-12 text-sm leading-6 text-zinc-400">{plan.blurb}</p>

        <div className="relative mt-6">
          <div className="flex items-baseline gap-1.5">
            <span key={price} className="animate-in text-5xl font-semibold tracking-tight text-white tabular-nums">
              ${price}
            </span>
            <span className="text-sm text-zinc-500">/mo</span>
          </div>
          <p className="mt-2 min-h-5 text-xs text-zinc-500">
            {annual ? (
              <>
                <span className="text-zinc-300">${perYear(plan).toLocaleString("en-US")}</span> billed annually
                <span className="ml-1.5 line-through decoration-zinc-600">${plan.monthly * 12}</span>
              </>
            ) : (
              "Billed monthly, cancel any time"
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => comingSoon(plan.name)}
          className={cn(
            "relative mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]",
            highlighted
              ? "bg-white text-black shadow-[0_0_30px_-6px_rgba(255,255,255,0.6)] hover:bg-zinc-200 hover:shadow-[0_0_40px_-4px_rgba(255,255,255,0.7)]"
              : "border border-white/15 bg-white/5 text-white hover:border-white/30 hover:bg-white/10",
          )}
        >
          Get {plan.name}
          <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
        </button>

        <ul className="relative mt-8 grid gap-3 border-t border-white/10 pt-7 text-sm">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-3 text-zinc-300">
              <span
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full",
                  highlighted ? "bg-indigo-400/20 text-indigo-200" : "bg-white/10 text-zinc-200",
                )}
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              {feature}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FlexBanner() {
  return (
    <div
      onMouseMove={trackPointer}
      style={{ "--mx": "50%", "--my": "50%" } as CSSProperties}
      className="group relative rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-px backdrop-blur-xl transition-colors duration-300 hover:border-white/30"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(500px circle at var(--mx) var(--my), rgba(52,211,153,0.10), transparent 65%)" }}
      />
      <div className="relative flex flex-col gap-6 rounded-[15px] px-7 py-7 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 shadow-[0_0_24px_-6px_rgba(52,211,153,0.7)]">
            <Zap className="size-5" strokeWidth={2} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-semibold text-white">Flex</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-zinc-300">
                Pay-as-you-go
              </span>
            </div>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-zinc-400">
              Perfect for getting started. Top up from <span className="font-semibold text-white">$10</span> and pay only
              for what you use. All channels are included: Telegram, Web Widget, social networks and more.
            </p>
            <p className="mt-2 text-xs text-zinc-500">Includes the &ldquo;Powered by STRIKE&rdquo; watermark.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => comingSoon("Flex")}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:border-white/30 hover:bg-white/10 active:scale-[0.98]"
        >
          Top up from $10
          <ArrowRight className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
