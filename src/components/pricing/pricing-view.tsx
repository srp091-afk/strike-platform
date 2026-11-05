"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Zap } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { ModularPlans } from "@/components/billing/modular-plans";
import { LegalLinks } from "@/components/legal-links";
import { toast } from "@/components/ui/toaster";
import type { Lang } from "@/lib/billing-catalog";
import { openPlanCheckout } from "@/lib/lemon-client";
import { cn } from "@/lib/utils";

const DICT = {
  en: {
    signIn: "Sign in",
    badge: "Pricing",
    title: "Simple, transparent pricing",
    subtitle:
      "Pick only the modules you need or save ~30% with the STRIKE Business bundle. One shared currency, STRIKE Credits, pays for every generation.",
    checkoutSoon: "Checkout for this plan is coming soon. Billing opens shortly.",
    credits: {
      badge: "100 SC = $1",
      title: "STRIKE Credits",
      text: "STRIKE Credits (SC) is the single currency of the platform. Use it to pay for any generation: AI video, agent replies, websites and more. 100 SC = $1. Credits you buy separately never expire.",
      cta: "Get started",
    },
    note: "All prices in USD. Subscriptions renew monthly. Cancel any time.",
    rights: "STRIKE. All rights reserved.",
    langLabel: "Language",
  },
  ru: {
    signIn: "Войти",
    badge: "Тарифы",
    title: "Простые и прозрачные тарифы",
    subtitle:
      "Выбирайте только нужные модули или экономьте ~30% с бандлом STRIKE Business. Единая валюта STRIKE Credits оплачивает любые генерации.",
    checkoutSoon: "Оплата этого тарифа скоро будет доступна. Биллинг откроется в ближайшее время.",
    credits: {
      badge: "100 SC = $1",
      title: "STRIKE Credits",
      text: "STRIKE Credits (SC) — единая валюта платформы. Она позволяет оплачивать любые генерации: AI-видео, ответы агентов, сайты и многое другое. 100 SC = $1. Кредиты, купленные отдельно, не сгорают.",
      cta: "Начать",
    },
    note: "Все цены в USD. Подписки продлеваются ежемесячно. Отмена в любой момент.",
    rights: "STRIKE. Все права защищены.",
    langLabel: "Язык",
  },
} satisfies Record<Lang, unknown>;

type Dict = (typeof DICT)[Lang];
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

export function PricingView() {
  // Язык хранится в локальном состоянии; по умолчанию RU.
  const [lang, setLang] = useState<Lang>("ru");
  const t: Dict = DICT[lang];
  const router = useRouter();

  /** Оверлей Lemon Squeezy; без сессии платёж не к чему привязать, поэтому сначала вход. */
  async function buy(key: string) {
    try {
      const result = await openPlanCheckout(key);
      if (result === "login") router.push("/login");
      else if (result === "missing") toast.error(t.checkoutSoon);
    } catch {
      toast.error(t.checkoutSoon);
    }
  }

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
        <Link href="/" aria-label="STRIKE" className="flex items-center">
          <BrandLogo />
        </Link>
        <div className="flex items-center gap-3">
          <LangSwitch lang={lang} onChange={setLang} label={t.langLabel} />
          <Link
            href="/login"
            className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-zinc-200 backdrop-blur transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            {t.signIn}
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-24 sm:px-6 sm:pt-24">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-zinc-300 backdrop-blur">
            <span className="size-1.5 rounded-full bg-strike shadow-[0_0_8px_rgba(207,2,52,0.9)]" />
            {t.badge}
          </p>
          <h1 className="mt-6 bg-gradient-to-b from-white to-zinc-500 bg-clip-text pb-2 text-5xl leading-[1.15] font-semibold tracking-tight text-transparent sm:text-6xl">
            {t.title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">{t.subtitle}</p>
        </Reveal>

        <Reveal delay={120} className="mt-12">
          <ModularPlans theme="dark" lang={lang} onSelect={(key) => void buy(key)} />
        </Reveal>

        <Reveal delay={150} className="mt-10">
          <CreditsBanner t={t} />
        </Reveal>

        <Reveal className="mt-14 text-center">
          <p className="text-sm text-zinc-500">{t.note}</p>
        </Reveal>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-600">
        <LegalLinks lang={lang} />
        <p className="mt-4">&copy; {t.rights}</p>
      </footer>
    </div>
  );
}
/** Минималистичный переключатель «RU | EN». */
function LangSwitch({ lang, onChange, label }: { lang: Lang; onChange: (lang: Lang) => void; label: string }) {
  const options: Lang[] = ["ru", "en"];
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center text-xs font-medium tracking-wide">
      {options.map((option, index) => (
        <span key={option} className="flex items-center">
          {index > 0 ? <span aria-hidden className="mx-1.5 text-zinc-700">|</span> : null}
          <button
            type="button"
            role="radio"
            aria-checked={lang === option}
            onClick={() => onChange(option)}
            className={cn(
              "rounded px-1 py-0.5 uppercase transition-colors",
              lang === option ? "text-white" : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            {option}
          </button>
        </span>
      ))}
    </div>
  );
}

function CreditsBanner({ t }: { t: Dict }) {
  return (
    <div
      onMouseMove={trackPointer}
      style={{ "--mx": "50%", "--my": "50%" } as CSSProperties}
      className="group relative rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-px backdrop-blur-xl transition-colors duration-300 hover:border-white/30"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(500px circle at var(--mx) var(--my), rgba(207,2,52,0.10), transparent 65%)" }}
      />
      <div className="relative flex flex-col gap-6 rounded-[15px] px-7 py-7 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-strike/25 bg-strike/10 text-strike-soft shadow-[0_0_24px_-6px_rgba(207,2,52,0.7)]">
            <Zap className="size-5" strokeWidth={2} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-semibold text-white">{t.credits.title}</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-zinc-300">{t.credits.badge}</span>
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-400">{t.credits.text}</p>
          </div>
        </div>
        <Link
          href="/login"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-strike px-5 py-3 text-sm font-semibold text-white shadow-[0_0_30px_-6px_rgba(207,2,52,0.7)] transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
        >
          {t.credits.cta}
          <ArrowRight className="size-4" strokeWidth={2} />
        </Link>
      </div>
    </div>
  );
}