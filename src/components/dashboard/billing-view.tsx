"use client";

import { Bitcoin, Check, CreditCard, Loader2, Copy, QrCode, Zap } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";

import { useRouter } from "next/navigation";

import { toast } from "@/components/ui/toaster";
import { BillingPlans } from "@/components/dashboard/billing-plans";
import { openCustomerPortal, openTopUpCheckout, watchCheckoutSuccess } from "@/lib/lemon-client";
import { cn } from "@/lib/utils";

const MIN_TOPUP = 10;
const DEFAULT_TOPUP = 50;
const WALLET_ADDRESS = "TКошелекЗаглушка123456789";

type Method = "card" | "crypto";

export type BillingData = {
  plan: "free" | "starter" | "pro" | "agency";
  priceUsd: number;
  status: string | null;
  renewsAt: string | null;
  balanceUsd: number;
  usage: { key: "messages" | "agents" | "campaigns" | "sites"; used: number; limit: number | null }[];
  hasSubscription: boolean;
  transactions: { id: string; createdAt: string; description: string; method: string; amountUsd: number; status: string }[];
};

const USAGE_LABELS = { messages: "Сообщения", agents: "AI-агенты", sites: "AI-сайты", campaigns: "AI-кампании" } as const;
const PLAN_TITLES = { free: "Flex (Pay-as-you-go)", starter: "Starter Plan", pro: "Pro Plan", agency: "Agency Plan" } as const;

const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date);
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

function statusBadge(status: string | null, plan: BillingData["plan"]) {
  if (plan === "free" || !status) return { label: "Без подписки", tone: "muted" as const };
  if (status === "active" || status === "on_trial") return { label: "Активен", tone: "ok" as const };
  if (status === "past_due" || status === "unpaid") return { label: "Просрочен", tone: "warn" as const };
  return { label: "Отменён", tone: "muted" as const };
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
        style={{ background: "radial-gradient(320px circle at var(--mx) var(--my), rgba(52,211,153,0.35), transparent 70%)" }}
      />
      <div className="relative h-full overflow-hidden rounded-[15px] border border-gray-800/60 bg-[#0a0a0a]/90 p-6 backdrop-blur-xl sm:p-7">
        {children}
      </div>
    </div>
  );
}

export function BillingView({ data }: { data: BillingData }) {
  const [method, setMethod] = useState<Method>("card");
  const [amountInput, setAmountInput] = useState(String(DEFAULT_TOPUP));
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const [managing, setManaging] = useState(false);
  const router = useRouter();
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  const badge = statusBadge(data.status, data.plan);
  const parsed = Number(amountInput);
  const amountValid = Number.isFinite(parsed) && parsed >= MIN_TOPUP;
  const amountLabel = amountValid ? parsed : DEFAULT_TOPUP;

  /** Оверлей Lemon Squeezy с точной суммой из поля; user_id уходит в custom data вебхука. */
  async function payByCard() {
    if (!amountValid || paying) return;
    setPaying(true);
    try {
      // После оплаты вебхук обновляет баланс с небольшой задержкой — перечитываем данные страницы.
      watchCheckoutSuccess(() => {
        setTimeout(() => router.refresh(), 3000);
        setTimeout(() => router.refresh(), 8000);
      });
      const result = await openTopUpCheckout(parsed);
      if (result === "login") router.push("/login");
      else if (result === "missing") toast.error("Чекаут пополнения пока не настроен.");
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
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(52,211,153,0.10),transparent_70%)]"
      />

      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Биллинг</p>
          <h1 className="mt-2 pb-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Тариф и баланс</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Управляйте подпиской, следите за лимитами и пополняйте баланс для оплаты по факту использования.
          </p>
        </header>

        <div className="mt-8 grid items-stretch gap-5 lg:grid-cols-2">
          {/* Текущий тариф и лимиты */}
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Текущий тариф</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">{PLAN_TITLES[data.plan]}</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {data.plan === "free"
                    ? "Оплата по факту использования с баланса"
                    : `$${data.priceUsd} / мес${
                        data.renewsAt
                          ? ` · ${data.status === "cancelled" ? "доступ до" : "следующее списание"} ${formatDate(data.renewsAt)}`
                          : ""
                      }`}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold",
                  badge.tone === "ok" && "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
                  badge.tone === "warn" && "border-amber-400/30 bg-amber-400/10 text-amber-300",
                  badge.tone === "muted" && "border-white/15 bg-white/5 text-zinc-300",
                )}
              >
                {badge.label}
              </span>
            </div>

            <button
              type="button"
              onClick={() => void manageSubscription()}
              className="mt-6 inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition-all duration-200 hover:border-white/30 hover:bg-white/10 active:scale-[0.98] sm:w-auto"
            >
              {managing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Управлять подпиской
            </button>

            <div className="mt-8 border-t border-white/10 pt-6">
              <h3 className="text-sm font-semibold text-white">Использование в этом месяце</h3>
              <ul className="mt-5 grid gap-5">
                {data.usage.map((item) => {
                  const label = USAGE_LABELS[item.key];
                  const percent = item.limit ? Math.min(100, Math.round((item.used / item.limit) * 100)) : 0;
                  return (
                    <li key={item.key}>
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-zinc-300">{label}</span>
                        <span className="tabular-nums text-zinc-400">
                          <span className="text-white">{item.used.toLocaleString("en-US")}</span>
                          {item.limit ? ` / ${item.limit.toLocaleString("en-US")}` : " · без лимита"}
                        </span>
                      </div>
                      {item.limit ? (
                        <div
                          role="progressbar"
                          aria-label={label}
                          aria-valuemin={0}
                          aria-valuemax={item.limit}
                          aria-valuenow={item.used}
                          className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"
                        >
                          <div
                            className={cn(
                              "h-full rounded-full transition-[width] duration-500",
                              percent >= 90
                                ? "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]"
                                : "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]",
                            )}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          </Card>

          {/* Пополнение баланса */}
          <Card>
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-emerald-400/25 bg-emerald-400/10 text-emerald-300 shadow-[0_0_24px_-6px_rgba(52,211,153,0.7)]">
                <Zap className="size-5" strokeWidth={2} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-white">Пополнение баланса</h2>
                <p className="text-sm text-zinc-400">Pay-as-you-go: платите только за использование.</p>
              </div>
            </div>
            <p className="mt-5 text-sm text-zinc-400">
              Текущий баланс:{" "}
              <span className="text-lg font-semibold text-emerald-300 tabular-nums">{formatUsd(data.balanceUsd)}</span>
            </p>

            <label htmlFor="topup-amount" className="mt-6 block text-sm font-medium text-zinc-300">
              Сумма пополнения
            </label>
            <div className="relative mt-2">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-zinc-500">$</span>
              <input
                id="topup-amount"
                type="number"
                inputMode="decimal"
                min={MIN_TOPUP}
                step={1}
                value={amountInput}
                onChange={(event) => setAmountInput(event.target.value)}
                className={cn(
                  "h-12 w-full rounded-xl border bg-white/5 pr-4 pl-8 text-base text-white tabular-nums outline-none transition-colors focus:border-emerald-400/50",
                  amountValid ? "border-gray-800" : "border-red-500/50",
                )}
              />
            </div>
            <p className={cn("mt-2 text-xs", amountValid ? "text-zinc-500" : "text-red-300")}>
              Минимальная сумма: ${MIN_TOPUP}
            </p>

            <div role="radiogroup" aria-label="Метод оплаты" className="mt-6 grid gap-3 sm:grid-cols-2">
              <MethodButton
                active={method === "card"}
                onClick={() => setMethod("card")}
                icon={<CreditCard className="size-5" strokeWidth={1.75} />}
                title="Bank Card"
                hint={
                  <span className="flex items-center gap-1.5">
                    <span className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-zinc-300 italic">
                      VISA
                    </span>
                    <span className="relative flex h-5 w-8 items-center justify-center" aria-label="Mastercard">
                      <span className="absolute left-0.5 size-4 rounded-full bg-red-500/80" />
                      <span className="absolute right-0.5 size-4 rounded-full bg-amber-400/80 mix-blend-screen" />
                    </span>
                  </span>
                }
              />
              <MethodButton
                active={method === "crypto"}
                onClick={() => setMethod("crypto")}
                icon={<Bitcoin className="size-5" strokeWidth={1.75} />}
                title="Crypto (USDT / BTC)"
                hint={<span className="text-xs text-zinc-500">TRC-20 · BTC</span>}
              />
            </div>

            {method === "card" ? (
              <button
                type="button"
                disabled={!amountValid || paying}
                onClick={() => void payByCard()}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-sm font-semibold text-black shadow-[0_0_30px_-6px_rgba(52,211,153,0.7)] transition-all duration-200 hover:bg-emerald-300 hover:shadow-[0_0_40px_-4px_rgba(52,211,153,0.8)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {paying ? <Loader2 className="size-4 animate-spin" /> : null}
                Оплатить картой
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
                        <span className="font-semibold text-white tabular-nums">{amountLabel} USDT</span> (сеть TRC-20)
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
                          {copied ? <Check className="size-3.5 text-emerald-300" strokeWidth={2.5} /> : <Copy className="size-3.5" />}
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

        <BillingPlans currentPlan={data.plan} subscriptionActive={data.plan !== "free" && data.status === "active"} />

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
                                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
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
        "flex flex-col items-start gap-3 rounded-xl border p-4 text-left transition-all duration-200",
        active
          ? "border-emerald-400/50 bg-emerald-400/10 text-white shadow-[0_0_30px_-10px_rgba(52,211,153,0.7)]"
          : "border-gray-800 bg-white/[0.03] text-zinc-300 hover:border-white/20 hover:bg-white/5",
      )}
    >
      <span className={cn("flex items-center gap-2.5 text-sm font-semibold", active && "text-emerald-300")}>
        {icon}
        <span className={active ? "text-white" : undefined}>{title}</span>
      </span>
      {hint}
    </button>
  );
}
