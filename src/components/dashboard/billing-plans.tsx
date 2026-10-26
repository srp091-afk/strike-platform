"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type CSSProperties, type MouseEvent } from "react";

import { toast } from "@/components/ui/toaster";
import { openCheckout, openCustomerPortal } from "@/lib/lemon-client";
import { cn } from "@/lib/utils";

type PlanId = "starter" | "pro" | "agency";

const PLAN_RANK: Record<"free" | PlanId, number> = { free: 0, starter: 1, pro: 2, agency: 3 };

const PLANS: { id: PlanId; name: string; price: number; blurb: string; features: string[] }[] = [
  {
    id: "starter",
    name: "Стартовый (Starter)",
    price: 49,
    blurb: "Для основателей, которые запускают первую воронку продаж на базе ИИ.",
    features: ["150 ИИ-кампаний", "3 ИИ-агента", "2 500 сообщений в месяц", "3 ИИ-сайта", "Все каналы связи включены"],
  },
  {
    id: "pro",
    name: "Про (Pro)",
    price: 99,
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
  {
    id: "agency",
    name: "Агентство (Agency)",
    price: 499,
    blurb: "Для агентств, которые масштабируют работу с клиентами на множество брендов.",
    features: [
      "Безлимит ИИ-агентов, сайтов и кампаний",
      "100 000 сообщений в месяц (Fair Use)",
      "White-label: убрать водяной знак",
      "API и вебхуки",
      "Все каналы связи включены",
    ],
  },
];

function trackPointer(event: MouseEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
  event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
}

/** Витрина тарифов: кнопки зависят от того, есть ли активная подписка и какой у неё план. */
export function BillingPlans({
  currentPlan,
  subscriptionActive,
}: {
  currentPlan: "free" | PlanId;
  subscriptionActive: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PlanId | null>(null);

  async function choose(id: PlanId) {
    if (pending) return;
    setPending(id);
    try {
      if (subscriptionActive) {
        // Смена плана у активной подписки — через портал, чтобы не создать вторую подписку.
        await openCustomerPortal();
      } else {
        const result = await openCheckout(id);
        if (result === "login") router.push("/login");
        else if (result === "missing") toast.error("Чекаут этого тарифа пока не настроен.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть чекаут.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section id="plans" className="mt-5 scroll-mt-24">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-white">Тарифы</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {subscriptionActive
            ? "Смена тарифа происходит в портале управления подпиской."
            : "Выберите тариф, чтобы открыть лимиты и все каналы."}
        </p>
      </div>
      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        {PLANS.map((plan) => {
          const highlighted = plan.id === "pro";
          const current = subscriptionActive && plan.id === currentPlan;
          const upgrade = subscriptionActive && PLAN_RANK[plan.id] > PLAN_RANK[currentPlan];
          const label = current
            ? "Текущий план"
            : !subscriptionActive
              ? "Выбрать тариф"
              : upgrade
                ? `Улучшить до ${plan.id === "agency" ? "Agency" : "Pro"}`
                : `Перейти на ${plan.id === "starter" ? "Starter" : "Pro"}`;

          return (
            <div
              key={plan.id}
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
              <div className="relative flex h-full flex-col overflow-hidden rounded-[15px] border border-gray-800/60 bg-[#0a0a0a]/90 p-7 backdrop-blur-xl">
                {highlighted ? (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -top-24 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-indigo-400/20 blur-3xl"
                  />
                ) : null}

                <div className="relative flex items-center justify-between gap-2">
                  <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                  {highlighted ? (
                    <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold tracking-wide text-black shadow-[0_0_20px_-2px_rgba(255,255,255,0.6)]">
                      Популярный
                    </span>
                  ) : null}
                </div>
                <p className="relative mt-2 min-h-12 text-sm leading-6 text-zinc-400">{plan.blurb}</p>

                <div className="relative mt-6 flex items-baseline gap-1.5">
                  <span className="text-5xl font-semibold tracking-tight text-white tabular-nums">${plan.price}</span>
                  <span className="text-sm text-zinc-500">/мес</span>
                </div>

                <button
                  type="button"
                  disabled={current || pending !== null}
                  aria-current={current ? "true" : undefined}
                  onClick={() => void choose(plan.id)}
                  className={cn(
                    "relative mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 active:scale-[0.98]",
                    current
                      ? "cursor-default border border-strike/30 bg-strike/10 text-strike-soft"
                      : highlighted
                        ? "bg-strike text-white shadow-[0_0_30px_-6px_rgba(207,2,52,0.45)] hover:brightness-110 hover:shadow-[0_0_40px_-4px_rgba(207,2,52,0.45)] disabled:opacity-60"
                        : "border border-white/15 bg-white/5 text-white hover:border-white/30 hover:bg-white/10 disabled:opacity-60",
                  )}
                >
                  {pending === plan.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : current ? (
                    <Check className="size-4" strokeWidth={2.5} />
                  ) : null}
                  {label}
                  {!current && pending !== plan.id ? (
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
                  ) : null}
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
        })}
      </div>
    </section>
  );
}
