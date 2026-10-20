"use client";

import { CREATIVE_FORMAT_OPTIONS } from "@/lib/creative-format";
import { cn } from "@/lib/utils";
import type { CreativeFormat } from "@/types/creatives";

/**
 * Segmented control: Лента (4:5) vs Сторис (9:16).
 * Drives template canvas aspect, safe zones and the Flux `aspect_ratio`.
 */
export function CreativeFormatToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: CreativeFormat;
  onChange: (format: CreativeFormat) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-wide text-zinc-400 uppercase">Формат</p>
      <div className="grid grid-cols-2 gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1" role="radiogroup" aria-label="Формат креатива">
        {CREATIVE_FORMAT_OPTIONS.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "rounded-lg px-3 py-2 text-center transition-all disabled:opacity-40",
                active ? "bg-white font-bold text-black shadow" : "text-zinc-400 hover:text-white",
              )}
            >
              <span className="block text-sm">{option.label}</span>
              <span className={cn("mt-0.5 block text-[11px]", active ? "text-zinc-600" : "text-zinc-500")}>
                {option.resolution}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
