"use client";

import { Minus, Plus, X } from "lucide-react";
import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { CreativeRender } from "@/components/creatives/CreativeRender";
import type { CreativeTemplate } from "@/lib/creative-templates";
import { UNIVERSAL_PREVIEW_CONCEPT } from "@/lib/preview-concept";
import { cn } from "@/lib/utils";
import type { CreativeFormat, StylePackItem } from "@/types/creatives";

/**
 * Premium horizontal style slider + slot-based pack ("Сборка пака").
 *
 * Clicking a card APPENDS `{ styleId, format }` to the pack (duplicates are
 * allowed — e.g. 2× Premium + 1× Side Fade) until it reaches `quantity`
 * slots. The stamped `format` is the CURRENTLY ACTIVE "ФОРМАТ" toggle at
 * add time, so one pack can mix 4:5 and 9:16 creatives. Slots above the
 * generate button mirror the pack (in each slot's own proportion) and
 * allow removing individual picks.
 */
export function StylePackPicker({
  templates,
  quantity,
  selectedStyles,
  onChange,
  disabled = false,
  accentColor,
  format = "4:5",
}: {
  templates: CreativeTemplate[];
  quantity: number;
  /** Pack slots: one entry per generated creative, length ≤ quantity. */
  selectedStyles: StylePackItem[];
  onChange: (next: StylePackItem[]) => void;
  disabled?: boolean;
  /** User accent from wizard state; live previews recolor to it. */
  accentColor?: string;
  /** Currently active "ФОРМАТ" toggle: previews + format stamped on add. */
  format?: CreativeFormat;
}) {
  const [category, setCategory] = useState("Все");

  const filters = useMemo(
    () => ["Все", ...Array.from(new Set(templates.map((template) => template.category).filter(Boolean)))],
    [templates],
  );
  const visibleStyles = templates.filter(
    (template) => category === "Все" || template.category === category,
  );
  const full = selectedStyles.length >= quantity;
  const countOf = (id: string) => selectedStyles.filter((item) => item.styleId === id).length;
  const templateById = (id: string) => templates.find((template) => template.id === id) ?? null;

  // Drag-to-scroll (mouse): grab and pull the slider horizontally.
  // `moved` (>5px) suppresses the card click that follows a drag, so
  // scrolling never accidentally adds a style to the pack.
  const sliderRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ down: false, startX: 0, scrollLeft: 0, moved: false });
  const [isDragging, setIsDragging] = useState(false);

  function onSliderMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const slider = sliderRef.current;
    if (!slider) return;
    dragRef.current = { down: true, startX: event.pageX, scrollLeft: slider.scrollLeft, moved: false };
    setIsDragging(true);
  }

  function onSliderMouseMove(event: ReactMouseEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const slider = sliderRef.current;
    if (!drag.down || !slider) return;
    const walk = event.pageX - drag.startX;
    if (Math.abs(walk) > 5) drag.moved = true;
    if (drag.moved) {
      event.preventDefault();
      slider.scrollLeft = drag.scrollLeft - walk;
    }
  }

  function endSliderDrag() {
    dragRef.current.down = false;
    setIsDragging(false);
  }

  function addStyle(id: string) {
    if (disabled || full) return;
    // Stamp the format that is active in the "ФОРМАТ" toggle RIGHT NOW.
    onChange([...selectedStyles, { styleId: id, format }]);
  }

  /** Remove exactly ONE instance of the style from the pack. */
  function removeOneStyle(id: string) {
    if (disabled) return;
    const index = selectedStyles.map((item) => item.styleId).lastIndexOf(id);
    if (index < 0) return;
    onChange(selectedStyles.filter((_, itemIndex) => itemIndex !== index));
  }

  function onRemoveOne(event: ReactMouseEvent, id: string) {
    event.stopPropagation();
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    removeOneStyle(id);
  }

  function onAddMore(event: ReactMouseEvent, id: string) {
    event.stopPropagation();
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    addStyle(id);
  }

  function onCardClick(id: string) {
    // The click right after a drag is a scroll gesture, not a pick.
    if (dragRef.current.moved) {
      dragRef.current.moved = false;
      return;
    }
    addStyle(id);
  }

  function removeAt(index: number) {
    if (disabled) return;
    onChange(selectedStyles.filter((_, itemIndex) => itemIndex !== index));
  }

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => {
          const active = filter === category;
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={active}
              disabled={disabled}
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

      {/* Horizontal premium slider (replaces the vertical grid). Mouse drag-to-scroll included. */}
      <div
        ref={sliderRef}
        className={cn(
          "flex flex-row flex-nowrap gap-6 overflow-x-auto px-2 pt-2 pb-6 snap-x snap-mandatory select-none [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          isDragging ? "cursor-grabbing snap-none" : "cursor-grab",
        )}
        onMouseDown={onSliderMouseDown}
        onMouseLeave={endSliderDrag}
        onMouseUp={endSliderDrag}
        onMouseMove={onSliderMouseMove}
      >
        {visibleStyles.map((template) => {
          const inPack = countOf(template.id);
          const selected = inPack > 0;
          return (
            <button
              key={template.id}
              type="button"
              aria-pressed={selected}
              aria-label={`Добавить стиль ${template.name} в пак`}
              disabled={disabled}
              className={cn(
                // Outer container: scale + ring only (NO overflow-hidden,
                // so the accent ring/shadow is never clipped by the slider).
                "group relative w-[300px] min-w-[300px] shrink-0 snap-center transform rounded-xl text-left transition-all duration-300 ease-out",
                // Resting: slightly dimmed, standard size. Hover/active:
                // fully lit and zoomed.
                selected
                  ? "scale-[1.03] opacity-100 shadow-2xl shadow-red-500/20 ring-2 ring-inset ring-red-500"
                  : "scale-100 cursor-pointer opacity-70 ring-1 ring-white/10 ring-inset hover:scale-[1.03] hover:opacity-100",
                full && !selected && "saturate-50",
              )}
              onClick={() => onCardClick(template.id)}
            >
              {/* Inner content wrapper owns the clipping + corners. */}
              <div className="relative overflow-hidden rounded-xl bg-zinc-950">
              {/* Live component rendering: the real creative template at
                  1080×1350, scaled into the 300px card. CreativeWrapper
                  applies transform: scale(cardWidth / 1080) with
                  transform-origin: top left, measured live. */}
              <div className="pointer-events-none relative w-full overflow-hidden">
                <CreativeRender
                  styleId={template.id}
                  headline={UNIVERSAL_PREVIEW_CONCEPT.headline}
                  subheadline={UNIVERSAL_PREVIEW_CONCEPT.subheadline}
                  bullets={UNIVERSAL_PREVIEW_CONCEPT.bullets}
                  badge={UNIVERSAL_PREVIEW_CONCEPT.badge}
                  buttonText={UNIVERSAL_PREVIEW_CONCEPT.cta}
                  images={UNIVERSAL_PREVIEW_CONCEPT.image_urls}
                  accentColor={accentColor || UNIVERSAL_PREVIEW_CONCEPT.accent_color}
                  format={format}
                />
              </div>

              {selected ? (
                <span className="absolute top-3 left-3 z-10 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                  В паке ×{inPack}
                </span>
              ) : null}

              <span className="absolute inset-0 z-10 grid place-items-center bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                {inPack > 0 ? (
                  <span className="flex gap-4">
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Убрать один стиль ${template.name} из пака`}
                      className="flex items-center gap-1.5 rounded-full bg-red-600/90 px-3.5 py-2 text-[11px] font-bold text-white shadow-xl transition hover:bg-red-500"
                      onClick={(event) => onRemoveOne(event, template.id)}
                    >
                      <Minus className="size-4" />
                      УБРАТЬ
                    </span>
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Добавить ещё стиль ${template.name} в пак`}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[11px] font-bold text-white shadow-xl transition hover:brightness-110",
                        full && "pointer-events-none opacity-40",
                      )}
                      onClick={(event) => onAddMore(event, template.id)}
                    >
                      <Plus className="size-4" />
                      ДОБАВИТЬ ЕЩЕ
                    </span>
                  </span>
                ) : full ? (
                  <span className="text-xs font-semibold tracking-wide text-white uppercase">Пак заполнен</span>
                ) : (
                  <span className="flex flex-col items-center gap-2 text-white">
                    <span className="grid size-11 place-items-center rounded-full bg-primary shadow-xl shadow-primary/30">
                      <Plus className="size-5" />
                    </span>
                    <span className="text-xs font-semibold tracking-wide uppercase">Добавить</span>
                  </span>
                )}
              </span>

              <span className="block px-3 pt-3 text-sm font-medium text-white">{template.name}</span>
              <span className="block px-3 pt-1 pb-3 text-xs text-zinc-500">{template.category}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Slot-based pack cart, directly above the generate button. */}
      <div>
        <p className="mb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">
          Пак креативов:{" "}
          <span className="text-zinc-200">
            {selectedStyles.length} из {quantity}
          </span>
        </p>
        <div className="flex flex-wrap items-end gap-3">
          {Array.from({ length: quantity }, (_, index) => {
            const item = selectedStyles[index];
            const template = item ? templateById(item.styleId) : null;
            if (!item) {
              return (
                <div
                  key={`empty-${index}`}
                  className="grid h-16 shrink-0 place-items-center rounded-xl border-2 border-dashed border-gray-600"
                  style={{ aspectRatio: format === "9:16" ? "9 / 16" : "4 / 5" }}
                  aria-label={`Пустой слот ${index + 1}`}
                >
                  <Plus className="size-5 text-gray-600" />
                </div>
              );
            }
            return (
              <div
                key={`${item.styleId}-${item.format}-${index}`}
                className="relative h-16 shrink-0 transition-all duration-300 starting:scale-75 starting:opacity-0"
                style={{ aspectRatio: item.format === "9:16" ? "9 / 16" : "4 / 5" }}
                title={`${template?.name ?? "Стиль"} · ${item.format}`}
              >
                <div className="h-full w-full overflow-hidden rounded-xl ring-1 ring-white/15">
                  {/* Live mini-render in the SLOT'S OWN proportion (the
                      format stamped when this slot was added). */}
                  <div className="pointer-events-none relative h-full w-full overflow-hidden">
                    <CreativeRender
                      styleId={item.styleId}
                      headline={UNIVERSAL_PREVIEW_CONCEPT.headline}
                      subheadline={UNIVERSAL_PREVIEW_CONCEPT.subheadline}
                      bullets={UNIVERSAL_PREVIEW_CONCEPT.bullets}
                      badge={UNIVERSAL_PREVIEW_CONCEPT.badge}
                      buttonText={UNIVERSAL_PREVIEW_CONCEPT.cta}
                      images={UNIVERSAL_PREVIEW_CONCEPT.image_urls}
                      accentColor={accentColor || UNIVERSAL_PREVIEW_CONCEPT.accent_color}
                      format={item.format}
                    />
                  </div>
                </div>
                <span className="absolute bottom-1 left-1 z-10 rounded bg-black/70 px-1 py-px text-[9px] font-bold text-white">
                  {item.format}
                </span>
                <button
                  type="button"
                  aria-label={`Убрать стиль из слота ${index + 1}`}
                  disabled={disabled}
                  className="absolute -top-2 -right-2 z-20 grid size-5 place-items-center rounded-full bg-red-600 text-white shadow-lg transition-colors hover:bg-red-500 disabled:opacity-40"
                  onClick={() => removeAt(index)}
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
