"use client";

import { cn } from "@/lib/utils";
import { creditsForCreatives, creditsLabel, usdForCreatives } from "@/lib/credits";

export function GenerationCostBadge({
  creativesCount,
  balance,
  className,
}: {
  creativesCount: number;
  /** When set, highlights red if cost exceeds balance. */
  balance?: number;
  className?: string;
}) {
  const totalCredits = creditsForCreatives(creativesCount);
  const dollarCost = usdForCreatives(creativesCount);
  const insufficient = typeof balance === "number" && balance < totalCredits;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <div
        className={cn(
          "flex items-center gap-3 rounded-full border px-5 py-2.5 backdrop-blur-md",
          insufficient
            ? "border-rose-500/50 bg-rose-950/40"
            : "border-zinc-800 bg-zinc-950/80",
        )}
      >
        <span
          className={cn(
            "text-xs font-medium uppercase tracking-widest",
            insufficient ? "text-rose-300/80" : "text-zinc-500",
          )}
        >
          Стоимость
        </span>
        <span className={cn("text-sm font-semibold", insufficient ? "text-rose-100" : "text-zinc-100")}>
          {totalCredits} {creditsLabel(totalCredits)}
        </span>
        <span className={cn("text-xs", insufficient ? "text-rose-300/70" : "text-zinc-600")}>
          ~${dollarCost}
        </span>
      </div>
      {insufficient ? (
        <p className="px-1 text-xs leading-5 text-rose-300">
          Недостаточно кредитов (баланс: {balance}). Пополните баланс, чтобы запустить генерацию.
        </p>
      ) : null}
    </div>
  );
}
