"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Zap } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { toast } from "@/components/ui/toaster";
import { openCheckout, type CheckoutTarget } from "@/lib/lemon-client";
import { cn } from "@/lib/utils";

const ANNUAL_DISCOUNT = 0.2;

type Lang = "en" | "ru";

type PlanId = "starter" | "pro" | "agency";

const PLAN_PRICES: Record<PlanId, number> = { starter: 49, pro: 99, agency: 499 };
const PLAN_ORDER: PlanId[] = ["starter", "pro", "agency"];

type Dict = {
  signIn: string;
  badge: string;
  title: string;
  subtitle: string;
  billingLabel: string;
  monthly: string;
  annually: string;
  save: string;
  mostPopular: string;
  perMonth: string;
  billedAnnually: string;
  billedMonthly: string;
  get: (name: string) => string;
  checkoutSoon: (name: string) => string;
  plans: Record<PlanId, { name: string; blurb: string; features: string[] }>;
  flex: {
    badge: string;
    descBefore: string;
    descAfter: string;
    watermark: string;
    cta: string;
  };
  note: string;
  rights: string;
  langLabel: string;
};

const DICT: Record<Lang, Dict> = {
  en: {
    signIn: "Sign in",
    badge: "Pricing",
    title: "Simple, transparent pricing",
    subtitle:
      "Start with pay-as-you-go, then scale to thousands of AI conversations across every channel. No hidden fees, no contracts. Upgrade the moment your pipeline demands it.",
    billingLabel: "Billing period",
    monthly: "Monthly",
    annually: "Annually",
    save: "Save 20%",
    mostPopular: "Most Popular",
    perMonth: "/mo",
    billedAnnually: "billed annually",
    billedMonthly: "Billed monthly, cancel any time",
    get: (name) => `Get ${name}`,
    checkoutSoon: (name) => `${name}: checkout is coming soon. Billing opens shortly.`,
    plans: {
      starter: {
        name: "Starter",
        blurb: "For founders launching their first AI-powered sales funnel.",
        features: ["150 AI campaigns", "3 AI agents", "2,500 messages / month", "3 AI websites", "All channels included"],
      },
      pro: {
        name: "Pro",
        blurb: "For growing teams that want automation to carry the load.",
        features: [
          "500 AI campaigns",
          "10 AI agents",
          "10,000 messages / month",
          "10 AI websites",
          "All channels included",
          "Team collaboration (up to 3 users)",
        ],
      },
      agency: {
        name: "Agency",
        blurb: "For agencies scaling client work across many brands.",
        features: [
          "Unlimited AI agents, websites and campaigns",
          "100,000 messages / month (Fair Use)",
          "White-label: remove the watermark",
          "API & Webhooks",
          "All channels included",
        ],
      },
    },
    flex: {
      badge: "Pay-as-you-go",
      descBefore: "Perfect for getting started. Top up from ",
      descAfter: " and pay only for what you use. All channels are included: Telegram, Web Widget, social networks and more.",
      watermark: "Includes the “Powered by STRIKE” watermark.",
      cta: "Top up from $10",
    },
    note: "All prices in USD. Annual billing is charged once per year at a 20% discount. Cancel any time.",
    rights: "STRIKE. All rights reserved.",
    langLabel: "Language",
  },
  ru: {
    signIn: "Войти",
    badge: "Тарифы",
    title: "Простые и прозрачные тарифы",
    subtitle:
      "Начните с оплаты по факту использования и масштабируйтесь до тысяч ИИ-диалогов во всех каналах. Без скрытых платежей и контрактов. Переходите на следующий тариф, как только этого потребует ваша воронка.",
    billingLabel: "Период оплаты",
    monthly: "Ежемесячно",
    annually: "За год",
    save: "Скидка 20%",
    mostPopular: "Популярный",
    perMonth: "/мес",
    billedAnnually: "оплата за год",
    billedMonthly: "Оплата каждый месяц, отмена в любой момент",
    get: (name) => `Выбрать ${name}`,
    checkoutSoon: (name) => `${name}: оплата скоро будет доступна. Биллинг откроется в ближайшее время.`,
    plans: {
      starter: {
        name: "Стартовый (Starter)",
        blurb: "Для основателей, которые запускают первую воронку продаж на базе ИИ.",
        features: [
          "150 ИИ-кампаний",
          "3 ИИ-агента",
          "2 500 сообщений в месяц",
          "3 ИИ-сайта",
          "Все каналы связи включены",
        ],
      },
      pro: {
        name: "Про (Pro)",
        blurb: "Для растущих команд, которые хотят переложить рутину на автоматизацию.",
        features: [
          "500 ИИ-кампаний",
          "10 ИИ-агентов",
          "10 000 сообщений в месяц",
          "10 ИИ-сайтов",
          "Все каналы связи включены",
          "Командная работа (до 3 пользователей)",
        ],
      },
      agency: {
        name: "Агентство (Agency)",
        blurb: "Для агентств, которые масштабируют работу с клиентами на множество брендов.",
        features: [
          "Безлимит ИИ-агентов, сайтов и кампаний",
          "100 000 сообщений в месяц (Fair Use)",
          "White-label: убрать водяной знак",
          "API и вебхуки",
          "Все каналы связи включены",
        ],
      },
    },
    flex: {
      badge: "Оплата по факту использования",
      descBefore: "Отлично подходит для старта. Пополнение от ",
      descAfter: " — платите только за то, что используете. Включены все каналы: Telegram, веб-виджет, соцсети и другие.",
      watermark: "Включает водяной знак «Powered by STRIKE».",
      cta: "Пополнить от $10",
    },
    note: "Все цены в USD. Годовая оплата списывается раз в год со скидкой 20%. Отмена в любой момент.",
    rights: "STRIKE. Все права защищены.",
    langLabel: "Язык",
  },
};

function perMonth(plan: PlanId, annual: boolean) {
  return annual ? Math.round(PLAN_PRICES[plan] * (1 - ANNUAL_DISCOUNT)) : PLAN_PRICES[plan];
}

function perYear(plan: PlanId) {
  return Math.round(PLAN_PRICES[plan] * 12 * (1 - ANNUAL_DISCOUNT));
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

export function PricingView() {
  // Язык хранится в локальном состоянии; по умолчанию RU.
  const [lang, setLang] = useState<Lang>("ru");
  const [annual, setAnnual] = useState(false);
  const t = DICT[lang];
  const router = useRouter();

  /** Оверлей Lemon Squeezy; без сессии платёж не к чему привязать, поэтому сначала вход. */
  async function buy(target: CheckoutTarget) {
    try {
      const result = await openCheckout(target);
      if (result === "login") router.push("/login");
      else if (result === "missing") toast.error(t.checkoutSoon(target));
    } catch {
      toast.error(t.checkoutSoon(target));
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
        <Link href="/" className="text-sm font-medium uppercase tracking-[0.18em] text-white">
          STRIKE
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
            <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
            {t.badge}
          </p>
          <h1 className="mt-6 bg-gradient-to-b from-white to-zinc-500 bg-clip-text pb-2 text-5xl leading-[1.15] font-semibold tracking-tight text-transparent sm:text-6xl">
            {t.title}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">{t.subtitle}</p>
        </Reveal>

        <Reveal delay={120} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <BillingToggle annual={annual} onChange={setAnnual} t={t} />
          <span
            className={cn(
              "rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 shadow-[0_0_20px_-6px_rgba(52,211,153,0.7)] transition-opacity",
              annual ? "opacity-100" : "opacity-70",
            )}
          >
            {t.save}
          </span>
        </Reveal>

        <div className="mt-14 grid items-stretch gap-5 lg:grid-cols-3">
          {PLAN_ORDER.map((id, index) => (
            <Reveal key={id} delay={index * 110} className="h-full">
              <PlanCard id={id} annual={annual} t={t} onBuy={() => void buy(id)} />
            </Reveal>
          ))}
        </div>

        <Reveal delay={150} className="mt-6">
          <FlexBanner t={t} onBuy={() => void buy("flex")} />
        </Reveal>

        <Reveal className="mt-14 text-center">
          <p className="text-sm text-zinc-500">{t.note}</p>
        </Reveal>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-600">&copy; {t.rights}</footer>
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

function BillingToggle({ annual, onChange, t }: { annual: boolean; onChange: (annual: boolean) => void; t: Dict }) {
  return (
    <div
      role="radiogroup"
      aria-label={t.billingLabel}
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
        { label: t.monthly, value: false },
        { label: t.annually, value: true },
      ].map((option) => (
        <button
          key={String(option.value)}
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

function PlanCard({ id, annual, t, onBuy }: { id: PlanId; annual: boolean; t: Dict; onBuy: () => void }) {
  const plan = t.plans[id];
  const price = perMonth(id, annual);
  const highlighted = id === "pro";

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

        <div className="relative flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-white">{plan.name}</h2>
          {highlighted ? (
            <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold tracking-wide text-black shadow-[0_0_20px_-2px_rgba(255,255,255,0.6)]">
              {t.mostPopular}
            </span>
          ) : null}
        </div>
        <p className="relative mt-2 min-h-12 text-sm leading-6 text-zinc-400">{plan.blurb}</p>

        <div className="relative mt-6">
          <div className="flex items-baseline gap-1.5">
            <span key={price} className="animate-in text-5xl font-semibold tracking-tight text-white tabular-nums">
              ${price}
            </span>
            <span className="text-sm text-zinc-500">{t.perMonth}</span>
          </div>
          <p className="mt-2 min-h-5 text-xs text-zinc-500">
            {annual ? (
              <>
                <span className="text-zinc-300">${perYear(id).toLocaleString("en-US")}</span> {t.billedAnnually}
                <span className="ml-1.5 line-through decoration-zinc-600">${PLAN_PRICES[id] * 12}</span>
              </>
            ) : (
              t.billedMonthly
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onBuy}
          className={cn(
            "relative mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]",
            highlighted
              ? "bg-white text-black shadow-[0_0_30px_-6px_rgba(255,255,255,0.6)] hover:bg-zinc-200 hover:shadow-[0_0_40px_-4px_rgba(255,255,255,0.7)]"
              : "border border-white/15 bg-white/5 text-white hover:border-white/30 hover:bg-white/10",
          )}
        >
          {t.get(plan.name)}
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

function FlexBanner({ t, onBuy }: { t: Dict; onBuy: () => void }) {
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
                {t.flex.badge}
              </span>
            </div>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-zinc-400">
              {t.flex.descBefore}
              <span className="font-semibold text-white">$10</span>
              {t.flex.descAfter}
            </p>
            <p className="mt-2 text-xs text-zinc-500">{t.flex.watermark}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onBuy}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:border-white/30 hover:bg-white/10 active:scale-[0.98]"
        >
          {t.flex.cta}
          <ArrowRight className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
