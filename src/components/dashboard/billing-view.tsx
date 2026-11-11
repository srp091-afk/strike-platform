"use client";

import { Bitcoin, Check, Copy, CreditCard, Loader2, QrCode, Zap } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";

import { useRouter } from "next/navigation";

import { toast } from "@/components/ui/toaster";
import { ConsentCheckbox } from "@/components/consent-checkbox";
import { BillingPlans } from "@/components/dashboard/billing-plans";
import { formatSc, TOP_UPS, tierLabel } from "@/lib/billing-catalog";
import { openCustomerPortal } from "@/lib/lemon-client";
import { PADDLE_CREDIT_PRICE_IDS } from "@/lib/paddle-catalog";
import { loadPaddle, onPaddleCheckoutCompleted, openPaddleCheckout } from "@/lib/paddle-client";
import { cn } from "@/lib/utils";

const WALLET_ADDRESS = "TКошелекЗаглушка123456789";
const DEFAULT_TOPUP_INDEX = 0;

type Method = "card" | "crypto";

export type BillingData = {
  plan: "free" | "starter" | "pro" | "agency";
  priceUsd: number;
  status: string | null;
  renewsAt: string | null;
  balanceUsd: number;
  strikeCredits: number;
  tiers: { agents: string; smm: string; ads: string; sites: string };
  isBundleActive: boolean;
  usage: { key: "messages" | "agents" | "campaigns" | "sites"; used: number; limit: number | null }[];
  hasSubscription: boolean;
  transactions: { id: string; createdAt: string; description: string; method: string; amountUsd: number; status: string }[];
};

const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date);
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

/** Подсветка границы и фона следом за курсором (как в pricing). */
function trackPointer(event: MouseEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--mx", `${event.clientX - box.left}px`);
  event.currentTarget.style.setProperty("--my", `${event.clientY - box.top}px`);
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      onMouseMove={trackPointer}
      style={{ "--mx": "50%", "--my": "0%" } as CSSProperties}
      className={cn("group relative h-full rounded-2xl bg-white/10 p-px", className)}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: "radial-gradient(320px circle at var(--mx) var(--my), rgba(207,2,52,0.35), transparent 70%)" }}
      />
      <div className="relative h-full overflow-hidden rounded-[15px] border border-gray-200 bg-[#fff] shadow-sm p-6 backdrop-blur-xl sm:p-7">
        {children}
      </div>
    </div>
  );
}

export function BillingView({ data }: { data: BillingData }) {
  const [method, setMethod] = useState<Method>("card");
  const [topUpIndex, setTopUpIndex] = useState(DEFAULT_TOPUP_INDEX);
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const [managing, setManaging] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const router = useRouter();
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void loadPaddle();
    return onPaddleCheckoutCompleted(() => {
      setTimeout(() => router.refresh(), 3000);
      setTimeout(() => router.refresh(), 8000);
    });
  }, [router]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const selected = TOP_UPS[topUpIndex];
  const moduleTiers = [
    { label: "Агенты", tier: data.tiers.agents },
    { label: "SMM", tier: data.tiers.smm },
    { label: "Ads", tier: data.tiers.ads },
    { label: "Сайты", tier: data.tiers.sites },
  ];

  /** Оверлей Paddle на Price ID выбранного пакета. userId уходит в customData вебхука. */
  async function payByCard() {
    if (paying) return;
    if (!agreed) {
      setConsentMissing(true);
      return;
    }
    const priceId = PADDLE_CREDIT_PRICE_IDS[selected.credits];
    if (!priceId) {
      toast.error("Для этого пакета не задан Price ID Paddle.");
      return;
    }
    setPaying(true);
    try {
      const result = await openPaddleCheckout(priceId);
      if (result === "login") router.push("/login");
      else if (result === "missing") toast.error("Чекаут Paddle пока не настроен. Добавьте NEXT_PUBLIC_PADDLE_CLIENT_TOKEN.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть чекаут.");
    } finally {
      setPaying(false);
    }
  }

  /** Есть подписка — портал Lemon Squeezy; нет — прокрутка к выбору тарифа. */
  async function manageSubscription() {
    if (!data.hasSubscription) {
      document.getElementById("plans")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (managing) return;
    setManaging(true);
    try {
      await openCustomerPortal();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть портал управления.");
    } finally {
      setManaging(false);
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(WALLET_ADDRESS);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Не удалось скопировать адрес.");
    }
  }

  return (
    <div className="relative isolate overflow-hidden bg-black text-zinc-400">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(207,2,52,0.10),transparent_70%)]"
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Биллинг</p>
          <h1 className="mt-2 pb-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Тариф и баланс</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Единая валюта платформы — STRIKE Credits (100 SC = $1): ею оплачиваются любые генерации во всех модулях.
          </p>
        </header>

        <div className="mt-8 grid items-stretch gap-5 lg:grid-cols-2">
          {/* Баланс и тарифы по модулям */}
          <Card>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Текущий баланс</p>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-5xl font-semibold tracking-tight text-[#0b0b0f] tabular-nums sm:text-6xl">{formatSc(data.strikeCredits)}</span>
              <span className="text-xl font-semibold text-strike">SC</span>
            </p>
            <p className="mt-1 text-sm text-gray-500">≈ {formatUsd(data.strikeCredits / 100)} · STRIKE Credits</p>

            <div className="mt-7 border-t border-gray-100 pt-6">
              <h3 className="text-sm font-semibold text-[#0b0b0f]">Активные тарифы</h3>
              {data.isBundleActive ? (
                <p className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-semibold text-strike">
                  <Check className="size-4" strokeWidth={2.5} />
                  Бандл STRIKE Business активен
                </p>
              ) : null}
              <ul className="mt-3 flex flex-wrap gap-2">
                {moduleTiers.map((item) => (
                  <li
                    key={item.label}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-500"
                  >
                    {item.label}: <span className="font-semibold text-[#0b0b0f]">{data.isBundleActive ? "Business" : tierLabel(item.tier)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <button
              type="button"
              onClick={() => void manageSubscription()}
              className="mt-7 inline-flex w-full items-center justify-center rounded-xl border border-gray-200 bg-[#ffffff] px-4 py-3 text-sm font-semibold text-[#0b0b0f] transition-colors hover:border-rose-300 hover:bg-rose-50/50 active:scale-[0.98] sm:w-auto"
            >
              {managing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {data.hasSubscription ? "Управлять подпиской" : "Выбрать тариф"}
            </button>
          </Card>

          {/* Пополнение баланса */}
          <Card>
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-strike">
                <Zap className="size-5" strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-white">Пополнение баланса</h2>
                <p className="text-sm text-zinc-400">Пакеты STRIKE Credits: кредиты не сгорают.</p>
              </div>
            </div>

            <div role="radiogroup" aria-label="Пакет пополнения" className="mt-6 grid gap-3 sm:grid-cols-3">
              {TOP_UPS.map((pack, index) => {
                const active = index === topUpIndex;
                return (
                  <button
                    key={pack.usd}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTopUpIndex(index)}
                    className={cn(
                      "rounded-2xl border bg-[#ffffff] p-4 text-left transition-colors",
                      active ? "border-strike ring-1 ring-strike" : "border-gray-200 hover:border-rose-300 hover:bg-rose-50/40",
                    )}
                  >
                    <span className="block text-lg font-bold tabular-nums text-[#0b0b0f]">+ {formatSc(pack.credits)} SC</span>
                    <span className="mt-1 block text-sm text-gray-500">${pack.usd}</span>
                    {pack.benefit ? <span className="mt-2 block text-xs font-medium text-strike">{pack.benefit}</span> : null}
                  </button>
                );
              })}
            </div>

            <div role="radiogroup" aria-label="Метод оплаты" className="mt-5 grid gap-3 sm:grid-cols-2">
              <MethodButton
                active={method === "card"}
                onClick={() => setMethod("card")}
                icon={<CreditCard className="size-5" strokeWidth={1.75} />}
                title="Bank Card"
                hint={<span className="text-xs text-gray-500">Visa · Mastercard</span>}
              />
              <MethodButton
                active={method === "crypto"}
                onClick={() => setMethod("crypto")}
                icon={<Bitcoin className="size-5" strokeWidth={1.75} />}
                title="Crypto (USDT / BTC)"
                hint={<span className="text-xs text-gray-500">TRC-20 · BTC</span>}
              />
            </div>

            {method === "card" ? (
              <ConsentCheckbox
                className="mt-6"
                checked={agreed}
                invalid={consentMissing}
                onChange={(value) => {
                  setAgreed(value);
                  if (value) setConsentMissing(false);
                }}
              />
            ) : null}

            {method === "card" ? (
              <button
                type="button"
                disabled={paying}
                onClick={() => void payByCard()}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-strike px-4 py-3 text-sm font-semibold text-white shadow-[0_0_30px_-6px_rgba(207,2,52,0.7)] transition-all duration-200 hover:brightness-110 hover:shadow-[0_0_40px_-4px_rgba(207,2,52,0.8)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {paying ? <Loader2 className="size-4 animate-spin" /> : null}
                Оплатить картой · ${selected.usd}
              </button>
            ) : null}
            {/* Accordion: плавное раскрытие блока с оплатой криптой */}
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
                method === "crypto" ? "mt-6 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
              )}
              aria-hidden={method !== "crypto"}
            >
              <div className="overflow-hidden">
                <div className="rounded-xl border border-gray-800 bg-white/[0.03] p-5">
                  <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
                    <div
                      aria-hidden
                      className="grid size-32 shrink-0 place-items-center rounded-xl bg-white text-black"
                    >
                      <QrCode className="size-20" strokeWidth={1.25} />
                    </div>
                    <div className="min-w-0 flex-1 text-center sm:text-left">
                      <p className="text-sm leading-6 text-zinc-300">
                        Отправьте точно{" "}
                        <span className="font-semibold text-white tabular-nums">{selected.usd} USDT</span> (сеть TRC-20)
                        на этот адрес
                      </p>
                      <div className="mt-3 flex items-center gap-2 rounded-lg border border-gray-800 bg-black/60 p-1.5 pl-3">
                        <code className="min-w-0 flex-1 truncate text-left text-xs text-zinc-300">{WALLET_ADDRESS}</code>
                        <button
                          type="button"
                          tabIndex={method === "crypto" ? 0 : -1}
                          onClick={() => void copyAddress()}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/10"
                        >
                          {copied ? <Check className="size-3.5 text-strike-soft" strokeWidth={2.5} /> : <Copy className="size-3.5" />}
                          {copied ? "Скопировано" : "Скопировать"}
                        </button>
                      </div>
                      <p className="mt-4 inline-flex items-center gap-2 text-sm text-amber-300" role="status">
                        <Loader2 className="size-4 animate-spin" />
                        Ожидание оплаты...
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <BillingPlans
          current={{ ...data.tiers, bundle: data.isBundleActive }}
          subscriptionActive={data.hasSubscription}
        />
        {/* История транзакций */}
        <section className="mt-5">
          <Card>
            <h2 className="text-lg font-semibold text-white">История транзакций</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500">
                    <th className="pb-3 font-medium">Дата</th>
                    <th className="pb-3 font-medium">Описание</th>
                    <th className="pb-3 font-medium">Метод</th>
                    <th className="pb-3 text-right font-medium">Сумма</th>
                    <th className="pb-3 text-right font-medium">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-zinc-500">
                        Транзакций пока нет.
                      </td>
                    </tr>
                  ) : null}
                  {data.transactions.map((tx) => {
                    const paid = tx.status === "paid";
                    return (
                      <tr key={tx.id}>
                        <td className="py-3.5 text-zinc-400">{formatDate(tx.createdAt)}</td>
                        <td className="py-3.5 font-medium text-white">{tx.description}</td>
                        <td className="py-3.5 text-zinc-400">{tx.method === "crypto" ? "Crypto" : "Card"}</td>
                        <td className="py-3.5 text-right tabular-nums text-white">{formatUsd(tx.amountUsd)}</td>
                        <td className="py-3.5 text-right">
                          <span
                            className={cn(
                              "inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                              paid
                                ? "border-strike/30 bg-strike/10 text-strike-soft"
                                : "border-amber-400/30 bg-amber-400/10 text-amber-300",
                            )}
                          >
                            {paid ? "Paid" : "Pending"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}

function MethodButton({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-3 rounded-xl border bg-[#ffffff] p-4 text-left transition-colors duration-200",
        active ? "border-strike ring-1 ring-strike" : "border-gray-200 hover:border-rose-300 hover:bg-rose-50/40",
      )}
    >
      <span className={cn("flex items-center gap-2.5 text-sm font-semibold", active ? "text-strike" : "text-[#0b0b0f]")}>
        {icon}
        <span className="text-[#0b0b0f]">{title}</span>
      </span>
      {hint}
    </button>
  );
}