"use client";

import { useEffect, useState } from "react";
import { Lock, Unlock } from "lucide-react";

import type { ComputedQuizResult } from "@/lib/sites/quiz-calculator";
import type { ThemeConfig } from "@/lib/sites/quiz-schema";
import type { QuizPalette } from "@/lib/sites/theme";

export function CalculationLoader({ steps, palette }: { steps: string[]; palette: QuizPalette }) {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(12);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => Math.min(steps.length - 1, current + 1));
      setWidth((current) => Math.min(100, current + 32));
    }, 420);
    const kick = window.setTimeout(() => setWidth(38), 30);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(kick);
    };
  }, [steps.length]);
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="h-1 w-44 overflow-hidden rounded-full" style={{ background: palette.line }}>
        <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${width}%`, background: palette.accent }} />
      </div>
      <p className="mt-5 text-sm" style={{ color: palette.muted }}>
        <span>{steps[index] ?? steps[0]}</span>
      </p>
    </div>
  );
}

export function ResultPreviewCard({
  result,
  theme,
  palette,
  unlocked = false,
  compact = false,
  onBack,
}: {
  result: ComputedQuizResult;
  theme: ThemeConfig;
  palette: QuizPalette;
  unlocked?: boolean;
  compact?: boolean;
  onBack?: () => void;
}) {
  const surface = kpiSurface(theme.preset);
  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        {onBack ? (
          <button type="button" className="text-sm" style={{ color: palette.muted }} onClick={onBack}>
            <span>← Назад</span>
          </button>
        ) : <span />}
        {unlocked ? (
          <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: "#DCFCE7", color: "#166534" }}>
            <Unlock size={12} />
            <span>Полный расчёт открыт</span>
          </span>
        ) : (
          <span className="text-xs" style={{ color: palette.muted }}><span>Расчёт готов</span></span>
        )}
      </div>
      <p className="text-[11px] font-semibold tracking-[0.16em]" style={{ color: palette.accent }}>
        <span>{result.eyebrow.toUpperCase()}</span>
      </p>
      <h2 className="text-[1.7rem] font-semibold leading-tight tracking-tight">
        <span>{result.headline}</span>
      </h2>
      {result.description ? <p className="text-sm leading-6" style={{ color: palette.muted }}><span>{result.description}</span></p> : null}
      {result.template === "diagnostic_audit" && result.audit ? <AuditBlock result={result} theme={theme} palette={palette} unlocked={unlocked} /> : null}
      {result.template === "curated_match" && result.matches ? <MatchBlock result={result} theme={theme} palette={palette} unlocked={unlocked} /> : null}
      {result.template !== "curated_match" && result.template !== "diagnostic_audit" && result.kpis.length > 0 ? (
        <div className={result.template === "estimate_breakdown" ? "grid gap-2" : "grid grid-cols-3 gap-2"}>
          {result.template === "estimate_breakdown" ? (
            <Kpi value={result.kpis[0]?.text ?? ""} label={result.kpis[0]?.label ?? ""} surface={surface} accent={palette.accent} large />
          ) : result.kpis.map((item) => <Kpi key={item.id} value={item.text} label={item.label} surface={surface} accent={palette.accent} />)}
          {result.template === "estimate_breakdown" && result.kpis.length > 1 ? (
            <div className="grid grid-cols-2 gap-2">
              {result.kpis.slice(1).map((item) => <Kpi key={item.id} value={item.text} label={item.label} surface={surface} accent={palette.accent} />)}
            </div>
          ) : null}
        </div>
      ) : null}
      {result.table ? <ResultTable result={result} theme={theme} palette={palette} unlocked={unlocked} compact={compact} /> : null}
      {result.footnote ? <p className="mt-3 text-[12px] leading-relaxed opacity-45"><span>{result.footnote}</span></p> : null}
    </section>
  );
}

function Kpi({ value, label, surface, accent, large = false }: { value: string; label: string; surface: ReturnType<typeof kpiSurface>; accent: string; large?: boolean }) {
  return (
    <div className={large ? "rounded-2xl px-4 py-4" : "rounded-2xl px-2.5 py-3 sm:px-3"} style={{ background: surface.bg, border: `1px solid ${surface.border}` }}>
      <p className={`font-semibold tabular-nums ${large ? "text-2xl" : "text-[15px] leading-5 sm:text-lg"}`} style={{ color: accent }}>
        <span>{value}</span>
      </p>
      <p className="mt-1 text-[10px] leading-3 sm:text-[11px]" style={{ color: surface.muted }}>
        <span>{label}</span>
      </p>
    </div>
  );
}

function ResultTable({ result, theme, palette, unlocked, compact }: { result: ComputedQuizResult; theme: ThemeConfig; palette: QuizPalette; unlocked: boolean; compact: boolean }) {
  const rows = result.table?.rows ?? [];
  const locked = rows.some((row) => row.locked) && !unlocked;
  const cell = compact ? "px-1.5 py-2 text-[11px]" : "px-2 py-2 text-xs sm:px-3 sm:text-sm";
  return (
    <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: palette.line }}>
      <table className="w-full table-fixed border-collapse text-left">
        <thead>
          <tr style={{ color: palette.muted }}>
            {result.table?.columns.map((column) => (
              <th key={column.key} className={`${cell} font-medium ${column.align === "right" ? "text-right" : "text-left"}`}>
                <span>{column.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={row.locked && !unlocked ? "blur-[5px] select-none pointer-events-none" : ""} style={{ borderTop: `1px solid ${palette.line}` }}>
              {row.cells.map((cellValue, index) => (
                <td key={`${row.id}-${index}`} className={`${cell} tabular-nums ${result.table?.columns[index]?.align === "right" ? "text-right" : "text-left"}`}>
                  <span>{cellValue.text}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {locked ? <LockOverlay text={result.lockBadgeText} theme={theme} /> : null}
    </div>
  );
}

function MatchBlock({ result, theme, palette, unlocked }: { result: ComputedQuizResult; theme: ThemeConfig; palette: QuizPalette; unlocked: boolean }) {
  const items = result.matches?.items ?? [];
  const locked = items.some((item) => item.locked) && !unlocked;
  return (
    <div className="grid gap-3">
      <p className="text-xs font-medium" style={{ color: palette.muted }}><span>{result.matches?.badgeText}</span></p>
      <div className="relative grid gap-2">
        {items.map((item, index) => (
          <article key={item.id} className={`flex gap-3 rounded-2xl border p-3 ${item.locked && !unlocked ? "blur-[5px] select-none pointer-events-none" : ""}`} style={{ borderColor: palette.line, background: palette.card }}>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className="grid h-10 w-10 shrink-0 place-items-center text-xs font-semibold tabular-nums" style={{ color: palette.muted }}>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold"><span>{item.title}</span></p>
              <p className="mt-1 text-xs" style={{ color: palette.muted }}><span>{item.subtitle}</span></p>
              <p className="mt-2 text-sm font-semibold tabular-nums" style={{ color: palette.accent }}><span>{item.price}</span></p>
            </div>
          </article>
        ))}
        {locked ? <LockOverlay text={result.lockBadgeText} theme={theme} /> : null}
      </div>
    </div>
  );
}

function AuditBlock({ result, theme, palette, unlocked }: { result: ComputedQuizResult; theme: ThemeConfig; palette: QuizPalette; unlocked: boolean }) {
  const audit = result.audit;
  if (!audit) return null;
  const locked = audit.insights.some((item) => item.locked) && !unlocked;
  return (
    <div className="grid gap-3">
      <div className="rounded-2xl border px-4 py-4" style={{ borderColor: palette.line }}>
        <div className="flex items-end justify-between gap-3">
          <p className="text-xs" style={{ color: palette.muted }}><span>{audit.scoreLabel}</span></p>
          <p className="text-3xl font-semibold tabular-nums" style={{ color: palette.accent }}><span>{audit.score}</span></p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full" style={{ background: palette.line }}>
          <div className="h-full rounded-full" style={{ width: `${audit.score}%`, background: palette.accent }} />
        </div>
        {audit.impact ? <p className="mt-3 text-sm font-medium"><span>{audit.impact}</span></p> : null}
      </div>
      <div className="relative grid gap-2">
        {audit.insights.map((item) => (
          <div key={item.id} className={`rounded-2xl border px-3 py-3 ${item.locked && !unlocked ? "blur-[5px] select-none pointer-events-none" : ""}`} style={{ borderColor: palette.line }}>
            <p className="text-sm font-medium"><span>{item.title}</span></p>
            <p className="mt-1 text-xs leading-5" style={{ color: palette.muted }}><span>{item.detail}</span></p>
          </div>
        ))}
        {locked ? <LockOverlay text={result.lockBadgeText} theme={theme} /> : null}
      </div>
    </div>
  );
}

function LockOverlay({ text, theme }: { text: string; theme: ThemeConfig }) {
  const dark = theme.preset === "dark_premium";
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-1/2 items-center justify-center">
      <span
        className="inline-flex max-w-[92%] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm backdrop-blur-md"
        style={{ background: dark ? "rgba(20,20,24,0.9)" : "rgba(255,255,255,0.9)", color: dark ? "#F4F4F5" : "#18181B", borderColor: dark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.08)" }}
      >
        <Lock size={12} />
        <span>{text}</span>
      </span>
    </div>
  );
}

function kpiSurface(preset: ThemeConfig["preset"]) {
  if (preset === "light_minimal") return { bg: "#0F0F12", fg: "#F4F4F5", muted: "#A1A1AA", border: "transparent" };
  if (preset === "editorial_warm") return { bg: "#1C1917", fg: "#F6F4F0", muted: "#D6D3D1", border: "transparent" };
  return { bg: "#141418", fg: "#F4F4F5", muted: "#A1A1AA", border: "rgba(255,255,255,0.10)" };
}
