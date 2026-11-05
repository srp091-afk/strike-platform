"use client";

import { ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import { useState, type CSSProperties, type MouseEvent } from "react";

import {
  BUNDLE,
  BUNDLE_SAVING,
  MODULE_BLURBS,
  MODULE_LABELS,
  MODULE_ORDER,
  TIERS,
  planKey,
  type Lang,
  type ModuleId,
  type Tier,
} from "@/lib/billing-catalog";
import { cn } from "@/lib/utils";

export type PlansTheme = "dark" | "light";

export type CurrentPlans = { agents: string; smm: string; sites: string; bundle: boolean };

const UI = {
  perMonth: { ru: "/мес", en: "/mo" },
  popular: { ru: "Популярный", en: "Most popular" },
  choose: { ru: "Выбрать", en: "Choose" },
  current: { ru: "Текущий тариф", en: "Current plan" },
  billed: { ru: "Оплата каждый месяц, отмена в любой момент", en: "Billed monthly, cancel any time" },
  allIn: { ru: "Всё включено", en: "All-in-one" },
} as const;

/** Токены оформления: тёмный лендинг и светлый портал (в портале избегаем инверсных white/black — только явные цвета). */
const THEMES = {
  dark: {
    tabsWrap: "border-white/10 bg-white/5",
    tabActive: "bg-white text-[#000000]",
    tabIdle: "text-zinc-400 hover:text-white",
    card: "bg-[#0a0a0a]/90",
    cardRing: "bg-white/10",
    cardRingHot: "bg-gradient-to-b from-white/50 via-indigo-300/30 to-white/5 shadow-[0_0_80px_-20px_rgba(129,140,248,0.65)]",
    title: "text-white",
    muted: "text-zinc-400",
    faint: "text-zinc-500",
    divider: "border-white/10",
    feature: "text-zinc-300",
    check: "bg-white/10 text-zinc-200",
    checkHot: "bg-indigo-400/20 text-indigo-200",
    badge: "bg-white text-[#000000]",
    btnPrimary: "bg-strike text-[#ffffff] shadow-[0_0_30px_-6px_rgba(207,2,52,0.45)] hover:brightness-110",
    btnSecondary: "border border-white/15 bg-white/5 text-[#ffffff] hover:border-white/30 hover:bg-white/10",
    btnCurrent: "border border-strike/30 bg-strike/10 text-strike-soft",
    saving: "border-strike/30 bg-strike/10 text-strike-soft",
  },
  light: {
    tabsWrap: "border-gray-200 bg-gray-100",
    tabActive: "bg-[#ffffff] text-[#0b0b0f] shadow-sm",
    tabIdle: "text-gray-500 hover:text-[#0b0b0f]",
    card: "bg-[#ffffff]",
    cardRing: "bg-gray-200",
    cardRingHot: "bg-strike",
    title: "text-[#0b0b0f]",
    muted: "text-gray-500",
    faint: "text-gray-400",
    divider: "border-gray-100",
    feature: "text-[#374151]",
    check: "bg-gray-100 text-gray-600",
    checkHot: "bg-rose-50 text-strike",
    badge: "bg-strike text-[#ffffff]",
    btnPrimary: "bg-strike text-[#ffffff] hover:brightness-110",
    btnSecondary: "border border-gray-200 bg-[#ffffff] text-[#0b0b0f] hover:border-rose-300 hover:bg-rose-50/50",
    btnCurrent: "border border-rose-200 bg-rose-50 text-strike",
    saving: "border-rose-200 bg-rose-50 text-strike",
  },
} as const;

function trackPointer(event: MouseEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
  event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
}

/**
 * Модульная витрина тарифов с табами: AI-Агенты, SMM-Студия, Сайты, Бандл.
 * Одинаковые данные для тёмного лендинга и светлого кабинета, отличаются только токены цвета.
 */
export function ModularPlans({
  theme,
  lang = "ru",
  current,
  onSelect,
  pendingKey,
}: {
  theme: PlansTheme;
  lang?: Lang;
  current?: CurrentPlans;
  onSelect: (key: string) => void;
  pendingKey?: string | null;
}) {
  const [active, setActive] = useState<ModuleId>("agents");
  const th = THEMES[theme];

  return (
    <div>
      <div className="flex justify-center">
        <div
          role="tablist"
          aria-label="Модули"
          className={cn("flex max-w-full flex-wrap justify-center gap-1 rounded-2xl border p-1", th.tabsWrap)}
        >
          {MODULE_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active === id}
              onClick={() => setActive(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-colors",
                active === id ? th.tabActive : th.tabIdle,
              )}
            >
              {id === "bundle" ? <Sparkles className="size-3.5 text-strike" strokeWidth={2.25} /> : null}
              {MODULE_LABELS[id][lang]}
            </button>
          ))}
        </div>
      </div>

      <p className={cn("mx-auto mt-5 max-w-xl text-center text-sm", th.muted)}>{MODULE_BLURBS[active][lang]}</p>

      {active === "bundle" ? (
        <div className="mx-auto mt-8 max-w-md">
          <PlanCard
            module="bundle"
            tier={BUNDLE}
            theme={theme}
            lang={lang}
            hot
            badge={BUNDLE_SAVING[lang]}
            isCurrent={Boolean(current?.bundle)}
            pending={pendingKey === "bundle"}
            onSelect={onSelect}
          />
        </div>
      ) : (
        <div
          className={cn(
            "mt-8 grid items-stretch gap-5",
            TIERS[active].length === 2 ? "mx-auto max-w-3xl md:grid-cols-2" : "lg:grid-cols-3",
          )}
        >
          {TIERS[active].map((tier) => (
            <PlanCard
              key={tier.id}
              module={active}
              tier={tier}
              theme={theme}
              lang={lang}
              hot={Boolean(tier.popular)}
              badge={tier.popular ? UI.popular[lang] : undefined}
              isCurrent={current ? !current.bundle && current[active] === tier.id : false}
              pending={pendingKey === planKey(active, tier.id)}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({
  module,
  tier,
  theme,
  lang,
  hot,
  badge,
  isCurrent,
  pending,
  onSelect,
}: {
  module: ModuleId;
  tier: Tier;
  theme: PlansTheme;
  lang: Lang;
  hot: boolean;
  badge?: string;
  isCurrent: boolean;
  pending: boolean;
  onSelect: (key: string) => void;
}) {
  const th = THEMES[theme];
  const key = planKey(module, tier.id);

  return (
    <div
      onMouseMove={theme === "dark" ? trackPointer : undefined}
      style={{ "--mx": "50%", "--my": "0%" } as CSSProperties}
      className={cn(
        "group relative h-full rounded-2xl p-px transition-transform duration-300 ease-out hover:-translate-y-1",
        hot ? th.cardRingHot : th.cardRing,
      )}
    >
      {theme === "dark" ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: "radial-gradient(320px circle at var(--mx) var(--my), rgba(165,180,252,0.7), transparent 70%)" }}
        />
      ) : null}
      <div className={cn("relative flex h-full flex-col rounded-[15px] p-7", th.card, theme === "light" && "shadow-sm")}>
        <div className="flex items-center justify-between gap-2">
          <h3 className={cn("text-lg font-semibold", th.title)}>{tier.name}</h3>
          {badge ? (
            <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide", th.badge)}>{badge}</span>
          ) : null}
        </div>

        <div className="mt-6 flex items-baseline gap-1.5">
          <span className={cn("text-5xl font-semibold tracking-tight tabular-nums", th.title)}>${tier.price}</span>
          <span className={cn("text-sm", th.faint)}>{UI.perMonth[lang]}</span>
        </div>
        <p className={cn("mt-2 text-xs", th.faint)}>{UI.billed[lang]}</p>

        <button
          type="button"
          disabled={isCurrent || pending}
          aria-current={isCurrent ? "true" : undefined}
          onClick={() => onSelect(key)}
          className={cn(
            "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-default",
            isCurrent ? th.btnCurrent : hot ? th.btnPrimary : th.btnSecondary,
            !isCurrent && "disabled:opacity-60",
          )}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : isCurrent ? <Check className="size-4" strokeWidth={2.5} /> : null}
          {isCurrent ? UI.current[lang] : `${UI.choose[lang]} ${tier.name}`}
          {!isCurrent && !pending ? <ArrowRight className="size-4" strokeWidth={2} /> : null}
        </button>

        <ul className={cn("mt-7 grid gap-3 border-t pt-6 text-sm", th.divider)}>
          {tier.features.map((feature) => (
            <li key={feature.ru} className={cn("flex items-start gap-3", th.feature)}>
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", hot ? th.checkHot : th.check)}>
                <Check className="size-3" strokeWidth={3} />
              </span>
              {feature[lang]}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}