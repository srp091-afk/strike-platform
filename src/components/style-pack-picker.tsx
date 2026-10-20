"use client";

import { Plus, X } from "lucide-react";
import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";

import { CreativeRender } from "@/components/creatives/CreativeRender";
import { StudioStylePreview } from "@/components/studio-style-preview";
import type { CreativeTemplate } from "@/lib/creative-templates";
import { UNIVERSAL_PREVIEW_CONCEPT } from "@/lib/preview-concept";
import { cn } from "@/lib/utils";

/**
 * Premium horizontal style slider + slot-based pack ("Сборка пака").
 *
 * Clicking a card APPENDS the style to `selectedStyles` (duplicates are
 * allowed — e.g. 2× Premium + 1× Side Fade) until the pack reaches
 * `quantity` slots. Slots above the generate button mirror the pack and
 * allow removing individual picks.
 */
export function StylePackPicker({
  templates,
  quantity,
  selectedStyles,
  onChange,
  disabled = false,
  accentColor,
}: {
  templates: CreativeTemplate[];
  quantity: number;
  /** `creative_templates` UUIDs, length ≤ quantity. */
  selectedStyles: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  /** User accent from wizard state; live previews recolor to it. */
  accentColor?: string;
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
  const countOf = (id: string) => selectedStyles.filter((styleId) => styleId === id).length;
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
    onChange([...selectedStyles, id]);
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
                "group relative w-[300px] min-w-[300px] shrink-0 snap-center overflow-hidden rounded-xl bg-zinc-950 text-left transition-all duration-300 ease-out",
                selected
                  ? "scale-[1.02] opacity-100 shadow-2xl shadow-primary/20 ring-2 ring-primary ring-offset-2 ring-offset-black"
                  : "cursor-pointer opacity-60 ring-1 ring-white/10 hover:scale-[1.02] hover:opacity-100",
                full && !selected && "saturate-50",
              )}
              onClick={() => onCardClick(template.id)}
            >
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
                />
              </div>

              {selected ? (
                <span className="absolute top-3 left-3 z-10 rounded-full bg-primary px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
                  В паке ×{inPack}
                </span>
              ) : null}

              <span
                className={cn(
                  "absolute inset-0 z-10 grid place-items-center bg-black/50 transition-opacity duration-300",
                  full ? "opacity-0" : "opacity-0 group-hover:opacity-100",
                )}
              >
                <span className="flex flex-col items-center gap-2 text-white">
                  <span className="grid size-11 place-items-center rounded-full bg-primary shadow-xl shadow-primary/30">
                    <Plus className="size-5" />
                  </span>
                  <span className="text-xs font-semibold tracking-wide uppercase">Добавить</span>
                </span>
              </span>

              <span className="block px-3 pt-3 text-sm font-medium text-white">{template.name}</span>
              <span className="block px-3 pt-1 pb-3 text-xs text-zinc-500">{template.category}</span>
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
        <div className="flex flex-wrap gap-3">
          {Array.from({ length: quantity }, (_, index) => {
            const styleId = selectedStyles[index];
            const template = styleId ? templateById(styleId) : null;
            if (!styleId) {
              return (
                <div
                  key={`empty-${index}`}
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-xl border-2 border-dashed border-gray-600"
                  aria-label={`Пустой слот ${index + 1}`}
                >
                  <Plus className="size-5 text-gray-600" />
                </div>
              );
            }
            return (
              <div
                key={`${styleId}-${index}`}
                className="relative h-16 w-16 shrink-0 transition-all duration-300 starting:scale-75 starting:opacity-0"
                title={template?.name ?? "Стиль"}
              >
                <div className="h-full w-full overflow-hidden rounded-xl ring-1 ring-white/15">
                  {template?.preview_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={template.preview_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full [&>*]:aspect-auto [&>*]:h-full">
                      <StudioStylePreview styleId={styleId} />
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  aria-label={`Убрать стиль из слота ${index + 1}`}
                  disabled={disabled}
                  className="absolute -top-2 -right-2 z-10 grid size-5 place-items-center rounded-full bg-red-600 text-white shadow-lg transition-colors hover:bg-red-500 disabled:opacity-40"
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
