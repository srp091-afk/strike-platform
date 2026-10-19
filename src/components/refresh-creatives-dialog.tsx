"use client";

import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AccentColorField, DEFAULT_ACCENT_COLOR } from "@/components/accent-color-field";
import { GenerationCostBadge } from "@/components/generation-cost-badge";
import { Button } from "@/components/ui/button";
import { DEFAULT_CREDITS_BALANCE, creditsForCreatives } from "@/lib/credits";
import { studioStyles, styleFilters, type StudioStyleKey } from "@/lib/studio-styles";
import { cn } from "@/lib/utils";

const QUANTITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type RefreshCreativesPayload = {
  styleId: StudioStyleKey;
  quantity: number;
  accentColor: string;
};

export function RefreshCreativesDialog({
  open,
  onClose,
  onConfirm,
  pending = false,
  initialStyle,
  initialAccent,
  creditsBalance = DEFAULT_CREDITS_BALANCE,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: RefreshCreativesPayload) => void;
  pending?: boolean;
  initialStyle?: string | null;
  initialAccent?: string | null;
  creditsBalance?: number;
}) {
  const [category, setCategory] = useState<(typeof styleFilters)[number]>("Все");
  const [selectedStyle, setSelectedStyle] = useState<StudioStyleKey>(
    resolveInitialStyle(initialStyle),
  );
  const [quantity, setQuantity] = useState(3);
  const [accentColor, setAccentColor] = useState(initialAccent?.trim() || DEFAULT_ACCENT_COLOR);

  const visibleStyles = studioStyles.filter((style) => category === "Все" || style.category === category);
  const cost = creditsForCreatives(quantity);
  const insufficient = creditsBalance < cost;

  useEffect(() => {
    if (!open) return;
    setSelectedStyle(resolveInitialStyle(initialStyle));
    setQuantity(3);
    setCategory("Все");
    setAccentColor(initialAccent?.trim() || DEFAULT_ACCENT_COLOR);
  }, [open, initialStyle, initialAccent]);

  useEffect(() => {
    if (visibleStyles.some((style) => style.key === selectedStyle)) return;
    const next = visibleStyles[0];
    if (next) setSelectedStyle(next.key);
  }, [category, selectedStyle, visibleStyles]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, pending, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="refresh-creatives-title"
        className="flex max-h-[min(92vh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4 sm:px-6">
          <div>
            <h2 id="refresh-creatives-title" className="text-lg font-semibold text-white">
              Обновить креативы
            </h2>
            <p className="mt-1 text-sm leading-6 text-zinc-400">
              Используем сохранённую стратегию и тексты. Старые активные креативы уйдут в архив.
            </p>
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            disabled={pending}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white disabled:opacity-40"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Количество</p>
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
              {QUANTITIES.map((count) => {
                const active = count === quantity;
                return (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={active}
                    disabled={pending}
                    className={cn(
                      "h-10 rounded-lg text-sm",
                      active ? "bg-white font-bold text-black" : "border border-zinc-800 bg-zinc-900 text-zinc-400",
                    )}
                    onClick={() => setQuantity(count)}
                  >
                    {count}
                  </button>
                );
              })}
            </div>
          </div>

          <AccentColorField value={accentColor} onChange={setAccentColor} disabled={pending} />

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Визуальный стиль</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {styleFilters.map((filter) => {
                const active = filter === category;
                return (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={active}
                    disabled={pending}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm",
                      active ? "bg-white font-semibold text-black" : "border border-zinc-800 bg-zinc-900 text-zinc-400",
                    )}
                    onClick={() => setCategory(filter)}
                  >
                    {filter}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {visibleStyles.map((style) => {
                const active = style.key === selectedStyle;
                return (
                  <button
                    key={style.key}
                    type="button"
                    aria-pressed={active}
                    disabled={pending}
                    className={cn(
                      "overflow-hidden rounded-xl border-2 bg-zinc-950 text-left transition-colors",
                      active ? "border-white ring-2 ring-white/20" : "border-zinc-800 hover:border-zinc-500",
                    )}
                    onClick={() => setSelectedStyle(style.key)}
                  >
                    {style.key === "before-after-vs" ? (
                      <VsPreview />
                    ) : style.key === "split-action" ? (
                      <SplitActionPreview />
                    ) : style.key === "dark-editorial-grid" ? (
                      <EditorialPreview />
                    ) : (
                      <LuxuryPreview />
                    )}
                    <span className="block px-3 pt-3 text-sm font-medium text-white">{style.name}</span>
                    <span className="block px-3 pt-1 pb-3 text-xs text-zinc-500">{style.note}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="flex flex-col gap-3 border-t border-zinc-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <GenerationCostBadge creativesCount={quantity} balance={creditsBalance} />
          <Button
            type="button"
            disabled={pending || insufficient || !selectedStyle}
            className="rounded-xl bg-white px-6 py-2.5 font-bold text-black shadow-lg hover:bg-zinc-200 disabled:opacity-40"
            onClick={() => onConfirm({ styleId: selectedStyle, quantity, accentColor })}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Запускаем…
              </>
            ) : (
              "Запустить генерацию"
            )}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function resolveInitialStyle(value: string | null | undefined): StudioStyleKey {
  if (value && studioStyles.some((style) => style.key === value)) {
    return value as StudioStyleKey;
  }
  return studioStyles[0]?.key ?? "before-after-vs";
}

function VsPreview() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-black text-white">
      <div className="absolute inset-0 grid grid-cols-2">
        <div className="bg-zinc-800" />
        <div className="bg-zinc-600" />
      </div>
      <div className="absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-rose-500 bg-black text-xs font-bold">
        VS
      </div>
    </div>
  );
}

function SplitActionPreview() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-black text-white">
      <div className="absolute inset-x-0 top-0 bg-black px-3 py-4 text-center text-[10px] font-semibold">
        Split Action
      </div>
      <div className="absolute inset-x-0 top-[20%] bottom-[16%] grid grid-cols-2">
        <div className="bg-zinc-800" />
        <div className="bg-zinc-600" />
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black px-3 py-3">
        <span className="rounded bg-amber-300 px-2 py-1 text-[8px] font-bold text-black">Badge</span>
        <span className="rounded bg-amber-300 px-3 py-1 text-[8px] font-bold text-black">CTA</span>
      </div>
    </div>
  );
}

function EditorialPreview() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-[#0A0A0A] text-white">
      <div className="absolute inset-3 border border-white/20" />
      <div className="absolute top-3 bottom-3 left-[58%] border-l border-white/20" />
      <div className="absolute top-[62%] right-3 left-3 border-t border-white/20" />
      <span className="absolute top-6 left-6 bg-white px-1.5 py-0.5 text-[9px] font-bold tracking-[0.16em] text-black uppercase">
        01
      </span>
      <div className="absolute top-[28%] right-[46%] left-6">
        <p className="text-[10px] tracking-[0.22em] text-zinc-500 uppercase">Editorial</p>
        <p className="mt-2 text-lg leading-none font-semibold tracking-tight">Сетка держит взгляд</p>
      </div>
      <div className="absolute top-6 right-6 bottom-[42%] left-[62%] bg-zinc-800" />
    </div>
  );
}

function LuxuryPreview() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-b from-zinc-800 via-black to-zinc-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.14),transparent_46%)]" />
      <div className="absolute inset-x-7 top-8 h-px bg-white/25" />
      <div className="absolute inset-x-7 bottom-8 h-px bg-white/25" />
      <div className="absolute inset-x-10 top-1/2 -translate-y-1/2 text-center">
        <p className="text-[10px] tracking-[0.32em] text-zinc-400 uppercase">Atelier</p>
        <p className="mt-3 text-xl font-light tracking-[0.18em] text-zinc-100 uppercase">Материал</p>
      </div>
    </div>
  );
}
