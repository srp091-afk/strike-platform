"use client";

import { DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import { cn } from "@/lib/utils";

export function AccentColorField({
  value,
  onChange,
  disabled = false,
  className,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  /** Optional form field name for native submits. */
  name?: string;
}) {
  const pickerHex = resolveAccentHex(value);

  return (
    <div className={cn("grid gap-2", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Акцентный цвет</p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          name={name}
          value={value}
          disabled={disabled}
          placeholder="#FFE600 или Золотой премиум"
          className="h-10 min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500 disabled:opacity-50"
          onChange={(event) => onChange(event.target.value)}
        />
        <label
          className={cn(
            "relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-zinc-700",
            disabled ? "opacity-50" : "cursor-pointer hover:border-zinc-500",
          )}
          title="Выбрать цвет"
        >
          <span className="absolute inset-0" style={{ backgroundColor: pickerHex }} aria-hidden />
          <input
            type="color"
            value={pickerHex}
            disabled={disabled}
            aria-label="Палитра акцентного цвета"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            onChange={(event) => onChange(event.target.value.toUpperCase())}
          />
        </label>
      </div>
      <p className="text-[11px] text-zinc-500">
        HEX или название. Палитра подставляет код в поле. Сейчас:{" "}
        <span className="font-medium text-zinc-300">{pickerHex}</span>
        {value.trim() && resolveAccentHex(value) !== value.trim().toUpperCase() ? (
          <span className="text-zinc-500"> · в промпт уйдёт «{value.trim()}»</span>
        ) : null}
      </p>
    </div>
  );
}

export { DEFAULT_ACCENT_COLOR };
