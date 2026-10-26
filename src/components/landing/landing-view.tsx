"use client";

import { ArrowRight, Check, ClipboardList, Layers, SlidersHorizontal, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { LegalLinks } from "@/components/legal-links";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type Lang = "RU" | "EN";

const DICT = {
  RU: {
    nav: {
      dashboard: "Дашборд",
      agents: "Агенты",
      sites: "Сайты",
      campaigns: "AI-Кампании",
      chats: "Чаты",
      signin: "Войти",
    },
    hero: {
      badge: "Платформа автоматизации",
      title: "AI-агенты, которые продают и поддерживают ваших клиентов 24/7",
      subtitle:
        "Создавайте умных ассистентов, квалифицируйте лидов и запускайте AI-кампании в любых каналах. Без сложного кода и скрытых платежей.",
      btnPrimary: "Начать бесплатно",
      btnSecondary: "Посмотреть тарифы",
    },
    features: {
      card1: {
        title: "Системные промпты в пару кликов",
        desc: "Задавайте роль, тон общения и инструкции прямо в дашборде. Ваши агенты готовы к работе за минуты.",
      },
      card2: {
        title: "Умные брифинг-боты",
        desc: "Боты сами определяют нишу клиента, проводят опрос и передают готовый бриф в вашу базу.",
      },
      card3: {
        title: "Все каналы в одном месте",
        desc: "Telegram, Web-виджеты на сайте, социальные сети. Единый центр управления диалогами.",
      },
    },
    useCases: {
      title: "Для кого подходит STRIKE?",
      item1: { title: "Фаундерам:", desc: "Для запуска первой AI-воронки продаж и проверки гипотез." },
      item2: { title: "Растущим командам:", desc: "Для автоматизации рутины, когда команда уже не справляется с потоком." },
      item3: {
        title: "Агентствам (White-label):",
        desc: "Для ведения сотен клиентов без водяных знаков платформы и с доступом по API.",
      },
    },
    cta: {
      badge: "Pay-as-you-go",
      title: "Начните автоматизацию уже сегодня",
      desc: "Идеально для старта. Пополните баланс от $10 и платите только за то, что используете. Все каналы включены.",
      btn: "Пополнить от $10",
    },
    footer: {
      rights: "© STRIKE. Все права защищены.",
    },
  },
  EN: {
    nav: {
      dashboard: "Dashboard",
      agents: "Agents",
      sites: "Sites",
      campaigns: "AI Campaigns",
      chats: "Chats",
      signin: "Sign in",
    },
    hero: {
      badge: "Automation Platform",
      title: "AI agents that sell and support your customers 24/7",
      subtitle:
        "Build smart assistants, qualify leads, and launch AI campaigns across all channels. No complex code, no hidden fees.",
      btnPrimary: "Start for free",
      btnSecondary: "View Pricing",
    },
    features: {
      card1: {
        title: "System prompts in a few clicks",
        desc: "Set the role, tone, and instructions right in the dashboard. Your agents are ready in minutes.",
      },
      card2: {
        title: "Smart briefing bots",
        desc: "Bots automatically identify the client's niche, conduct interviews, and send the completed brief to your database.",
      },
      card3: {
        title: "All channels in one place",
        desc: "Telegram, Web widgets, social networks. A unified command center for all dialogues.",
      },
    },
    useCases: {
      title: "Who is STRIKE for?",
      item1: { title: "Founders:", desc: "To launch your first AI sales funnel and test hypotheses." },
      item2: { title: "Growing teams:", desc: "To automate routine tasks when your team can no longer handle the volume." },
      item3: {
        title: "Agencies (White-label):",
        desc: "To manage hundreds of clients without platform watermarks and with full API access.",
      },
    },
    cta: {
      badge: "Pay-as-you-go",
      title: "Start automating today",
      desc: "Perfect for getting started. Top up from $10 and pay only for what you use. All channels included.",
      btn: "Top up from $10",
    },
    footer: {
      rights: "© STRIKE. All rights reserved.",
    },
  },
} as const;

const NAV_ITEMS = [
  { key: "dashboard", href: "/dashboard" },
  { key: "agents", href: "/agents" },
  { key: "sites", href: "/funnels" },
  { key: "campaigns", href: "/ads" },
  { key: "chats", href: "/chats" },
] as const;

const FEATURE_ICONS = [SlidersHorizontal, ClipboardList, Layers] as const;

/** Плавное появление блока при попадании во вьюпорт. */
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

/** Подсветка границы и фона следом за курсором. */
function trackPointer(event: MouseEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
  event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
}

export function LandingView() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("RU");
  const t = DICT[lang];

  /** Auth guard для пунктов меню: без сессии отправляем на /login (жёсткая защита — в middleware). */
  async function openProtected(href: string) {
    try {
      const { data } = await createSupabaseBrowserClient().auth.getUser();
      router.push(data.user ? href : "/login");
    } catch {
      router.push("/login");
    }
  }

  const featureCards = [t.features.card1, t.features.card2, t.features.card3];
  const useCases = [t.useCases.item1, t.useCases.item2, t.useCases.item3];

  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-black text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[720px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(129,140,248,0.22),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(70%_55%_at_50%_0%,black,transparent)]"
      />

      <header className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-sm font-medium uppercase tracking-[0.18em] text-white"
          >
            STRIKE
          </button>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => void openProtected(item.href)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
              >
                {t.nav[item.key]}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <LangSwitch lang={lang} onChange={setLang} />
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm font-medium text-zinc-200 backdrop-blur transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              {t.nav.signin}
            </button>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto pb-2 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => void openProtected(item.href)}
              className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:text-white"
            >
              {t.nav[item.key]}
            </button>
          ))}
        </nav>
      </header>

      <main>
        <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-24 sm:px-6 sm:pt-24">
          <Reveal className="mx-auto max-w-4xl text-center">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-zinc-300 backdrop-blur">
              <span className="size-1.5 rounded-full bg-strike shadow-[0_0_8px_rgba(207,2,52,0.9)]" />
              {t.hero.badge}
            </p>
            <h1 className="mt-6 bg-gradient-to-b from-white to-zinc-500 bg-clip-text pb-2 text-4xl leading-[1.15] font-semibold tracking-tight text-balance text-transparent sm:text-6xl">
              {t.hero.title}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">{t.hero.subtitle}</p>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3 text-sm font-semibold text-white shadow-[0_0_30px_-6px_rgba(207,2,52,0.45)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_-4px_rgba(207,2,52,0.45)] active:scale-[0.98] sm:w-auto"
              >
                {t.hero.btnPrimary}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={() => router.push("/pricing")}
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:border-white/30 hover:bg-white/10 active:scale-[0.98] sm:w-auto"
              >
                {t.hero.btnSecondary}
              </button>
            </div>
          </Reveal>

          <div className="mt-24 grid items-stretch gap-5 md:grid-cols-3">
            {featureCards.map((card, index) => {
              const Icon = FEATURE_ICONS[index]!;
              return (
                <Reveal key={card.title} delay={index * 110} className="h-full">
                  <FeatureCard icon={<Icon className="size-5" strokeWidth={1.75} />} title={card.title} desc={card.desc} />
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
          <Reveal className="mx-auto max-w-3xl">
            <h2 className="text-center text-3xl font-semibold tracking-tight text-white sm:text-4xl">{t.useCases.title}</h2>
            <ul className="mt-10 grid gap-5">
              {useCases.map((item) => (
                <li key={item.title} className="flex items-start gap-4">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-zinc-200">
                    <Check className="size-3.5" strokeWidth={3} />
                  </span>
                  <p className="text-base leading-7 text-zinc-400">
                    <span className="font-semibold text-white">{item.title}</span> {item.desc}
                  </p>
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
          <Reveal>
            <CtaCard
              badge={t.cta.badge}
              title={t.cta.title}
              desc={t.cta.desc}
              button={t.cta.btn}
              onClick={() => router.push("/login")}
            />
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-600">
        <LegalLinks lang={lang === "RU" ? "ru" : "en"} />
        <p className="mt-4">{t.footer.rights}</p>
      </footer>
    </div>
  );
}

/** Минималистичный переключатель «RU | EN». */
function LangSwitch({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  const options: Lang[] = ["RU", "EN"];
  return (
    <div role="radiogroup" aria-label="Language" className="flex items-center text-xs font-medium tracking-wide">
      {options.map((option, index) => (
        <span key={option} className="flex items-center">
          {index > 0 ? (
            <span aria-hidden className="mx-1.5 text-zinc-700">
              |
            </span>
          ) : null}
          <button
            type="button"
            role="radio"
            aria-checked={lang === option}
            onClick={() => onChange(option)}
            className={cn("rounded px-1 py-0.5 transition-colors", lang === option ? "text-white" : "text-zinc-500 hover:text-zinc-300")}
          >
            {option}
          </button>
        </span>
      ))}
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div
      onMouseMove={trackPointer}
      style={{ "--mx": "50%", "--my": "0%" } as CSSProperties}
      className="group relative h-full rounded-2xl bg-white/10 p-px transition-transform duration-300 ease-out hover:-translate-y-1"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(320px circle at var(--mx) var(--my), rgba(165,180,252,0.7), transparent 70%)" }}
      />
      <div className="relative flex h-full flex-col overflow-hidden rounded-[15px] bg-[#0a0a0a]/90 p-7 backdrop-blur-xl">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: "radial-gradient(420px circle at var(--mx) var(--my), rgba(129,140,248,0.12), transparent 65%)" }}
        />
        <span className="relative grid size-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-zinc-200">
          {icon}
        </span>
        <h3 className="relative mt-6 text-lg font-semibold text-white">{title}</h3>
        <p className="relative mt-2 text-sm leading-6 text-zinc-400">{desc}</p>
      </div>
    </div>
  );
}

function CtaCard({
  badge,
  title,
  desc,
  button,
  onClick,
}: {
  badge: string;
  title: string;
  desc: string;
  button: string;
  onClick: () => void;
}) {
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
      <div className="relative flex flex-col gap-6 rounded-[15px] px-7 py-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-strike/25 bg-strike/10 text-strike-soft shadow-[0_0_24px_-6px_rgba(207,2,52,0.7)]">
            <Zap className="size-5" strokeWidth={2} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-lg font-semibold text-white">{title}</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs text-zinc-300">{badge}</span>
            </div>
            <p className="mt-1.5 max-w-xl text-sm leading-6 text-zinc-400">{desc}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClick}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-strike px-5 py-3 text-sm font-semibold text-white shadow-[0_0_30px_-6px_rgba(207,2,52,0.7)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_-4px_rgba(207,2,52,0.8)] active:scale-[0.98]"
        >
          {button}
          <ArrowRight className="size-4" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
