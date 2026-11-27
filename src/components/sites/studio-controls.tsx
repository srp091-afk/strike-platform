"use client";

import { useState, type CSSProperties } from "react";
import { ChevronDown } from "lucide-react";

const realInk = {
  "--color-white": "#ffffff",
  "--color-zinc-200": "#e4e4e7",
  "--color-zinc-950": "#09090b",
} as CSSProperties;

export function StudioToggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-[#52525b]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        style={{ ...realInk, backgroundColor: checked ? "#09090b" : "#e4e4e7" }}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-0 p-0 transition-colors ${checked ? "bg-zinc-950" : "bg-zinc-200"}`}
        onClick={() => onChange(!checked)}
      >
        <span
          aria-hidden="true"
          style={{ backgroundColor: "#ffffff", width: "1rem", height: "1rem" }}
          className={`pointer-events-none block h-4 w-4 rounded-full bg-white shadow-xs transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
        />
      </button>
    </label>
  );
}

export function StudioSelect({ value, options, onChange, ariaLabel }: { value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  const current = options.find((item) => item.value === value) ?? options[0];
  return (
    <div className="relative">
      <button type="button" aria-label={ariaLabel} aria-expanded={open} className="flex h-10 w-full items-center justify-between rounded-xl border border-[#e4e4e7] bg-[#fff] px-3 text-left text-sm text-[#09090b]" onClick={() => setOpen((item) => !item)}>
        <span className="truncate">{current?.label ?? ""}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-[#71717a]" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[#e4e4e7] bg-[#fff] p-1 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.25)]">
          {options.map((item) => (
            <button key={item.value || item.label} type="button" className={`block w-full rounded-lg px-3 py-2 text-left text-sm ${item.value === value ? "bg-[#f4f4f5] font-medium" : "hover:bg-[#fafafa]"}`} onClick={() => { onChange(item.value); setOpen(false); }}>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
