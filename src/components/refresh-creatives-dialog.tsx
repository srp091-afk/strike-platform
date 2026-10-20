"use client";

import { Loader2, Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AccentColorField, DEFAULT_ACCENT_COLOR } from "@/components/accent-color-field";
import { CreativeFormatToggle } from "@/components/creative-format-toggle";
import { GenerationCostBadge } from "@/components/generation-cost-badge";
import { StylePackPicker } from "@/components/style-pack-picker";
import { Button } from "@/components/ui/button";
import type { CreativeTemplate } from "@/lib/creative-templates";
import { DEFAULT_CREDITS_BALANCE, creditsForCreatives } from "@/lib/credits";
import { DEFAULT_CREATIVE_FORMAT } from "@/lib/creative-format";
import { cn } from "@/lib/utils";
import type { CreativeFormat } from "@/types/creatives";

const QUANTITIES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export type RefreshCreativesPayload = {
  /** Style pack: one `creative_templates.id` (UUID) per generated creative. */
  styleIds: string[];
  quantity: number;
  accentColor: string;
  /** Feed 4:5 vs stories 9:16 — drives Flux aspect_ratio + template canvas. */
  format: CreativeFormat;
};

type TemplatesResponse = { templates?: CreativeTemplate[]; error?: string };

export function RefreshCreativesDialog({
  open,
  onClose,
  onConfirm,
  pending = false,
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
  // Slot-based pack: one template UUID per generated creative (≤ quantity).
  // Always starts EMPTY — no style is preselected when the dialog opens.
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(3);
  const [format, setFormat] = useState<CreativeFormat>(DEFAULT_CREATIVE_FORMAT);
  const [accentColor, setAccentColor] = useState(initialAccent?.trim() || DEFAULT_ACCENT_COLOR);
  const [templates, setTemplates] = useState<CreativeTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const cost = creditsForCreatives(quantity);
  const insufficient = creditsBalance < cost;
  const packComplete = selectedStyles.length === quantity;
  const remaining = quantity - selectedStyles.length;

  function changeQuantity(count: number) {
    setQuantity(count);
    setSelectedStyles((current) => current.slice(0, count));
  }

  // Dynamic style list from Supabase `creative_templates` via /api/creative-templates.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTemplatesLoading(true);
    setTemplatesError(null);
    fetch("/api/creative-templates", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as TemplatesResponse;
        if (!response.ok) throw new Error(payload.error || "Не удалось загрузить стили.");
        if (!cancelled) setTemplates(payload.templates ?? []);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setTemplates([]);
          setTemplatesError(error instanceof Error ? error.message : "Не удалось загрузить стили.");
        }
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open ]);

  useEffect(() => {
    if (!open) return;
    // Strictly empty pack on every open (0 из quantity) — no preselection.
    setSelectedStyles([]);
    setQuantity(3);
    setFormat(DEFAULT_CREATIVE_FORMAT);
    setFullscreen(false);
    setAccentColor(initialAccent?.trim() || DEFAULT_ACCENT_COLOR);
  }, [open, initialAccent]);

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
      className={cn(
        "fixed inset-0 z-[80] flex items-end justify-center bg-black/70 sm:items-center",
        fullscreen ? "p-0" : "p-4",
      )}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="refresh-creatives-title"
        className={cn(
          "flex flex-col overflow-hidden border border-zinc-800 bg-zinc-950 shadow-2xl",
          fullscreen
            ? "h-full max-h-none w-full max-w-none rounded-none border-0"
            : "max-h-[min(92vh,52rem)] w-full max-w-6xl rounded-2xl",
        )}
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
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={fullscreen ? "Свернуть окно" : "Развернуть на весь экран"}
              aria-pressed={fullscreen}
              disabled={pending}
              className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white disabled:opacity-40"
              onClick={() => setFullscreen((value) => !value)}
            >
              {fullscreen ? <Minimize2 className="size-5" /> : <Maximize2 className="size-5" />}
            </button>
            <button
              type="button"
              aria-label="Закрыть"
              disabled={pending}
              className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white disabled:opacity-40"
              onClick={onClose}
            >
              <X className="size-5" />
            </button>
          </div>
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
                    onClick={() => changeQuantity(count)}
                  >
                    {count}
                  </button>
                );
              })}
            </div>
          </div>

          <CreativeFormatToggle value={format} onChange={setFormat} disabled={pending} />

          <AccentColorField value={accentColor} onChange={setAccentColor} disabled={pending} />

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Визуальные стили</p>
            {templatesLoading ? (
              <p className="flex items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="size-4 animate-spin" />
                Загружаем стили…
              </p>
            ) : templatesError ? (
              <p className="text-sm text-red-300">{templatesError}</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-zinc-500">В базе нет активных стилей (таблица creative_templates пуста).</p>
            ) : (
              <StylePackPicker
                templates={templates}
                quantity={quantity}
                selectedStyles={selectedStyles}
                onChange={setSelectedStyles}
                disabled={pending}
                accentColor={accentColor}
                format={format}
              />
            )}
          </div>
        </div>

        <footer className="flex flex-col gap-3 border-t border-zinc-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <GenerationCostBadge creativesCount={quantity} balance={creditsBalance} />
          <Button
            type="button"
            disabled={pending || insufficient || !packComplete || templatesLoading}
            className="rounded-xl bg-white px-6 py-2.5 font-bold text-black shadow-lg hover:bg-zinc-200 disabled:opacity-40"
            onClick={() => onConfirm({ styleIds: selectedStyles, quantity, accentColor, format })}
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Запускаем…
              </>
            ) : !packComplete ? (
              `Выберите ещё ${remaining} ${remaining === 1 ? "стиль" : "стиля"}`
            ) : (
              "Сгенерировать пак"
            )}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}