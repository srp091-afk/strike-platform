"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { LandingFooterExtras, LandingSections } from "@/components/landing/landing-sections";
import { Reveal } from "@/components/landing/landing-ui";
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
      campaigns: "Ads & Креативы",
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
    footer: {
      rights: "© STRIKE. Все права защищены.",
    },
  },
  EN: {
    nav: {
      dashboard: "Dashboard",
      agents: "Agents",
      sites: "Sites",
      campaigns: "Ads & Creatives",
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
            aria-label="STRIKE"
            className="flex items-center"
          >
            <BrandLogo />
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
        </section>

        <LandingSections lang={lang} onStart={() => router.push("/dashboard")} />
      </main>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-600">
        <LegalLinks lang={lang === "RU" ? "ru" : "en"} />
        <LandingFooterExtras lang={lang}>
          <p className="mt-4">{t.footer.rights}</p>
        </LandingFooterExtras>
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
