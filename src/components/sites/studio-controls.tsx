"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export function StudioToggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-xs text-[#52525b]">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${checked ? "bg-[#09090b]" : "bg-[#e4e4e7]"}`} onClick={() => onChange(!checked)}>
        <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-[#fff] transition-transform ${checked ? "translate-x-3.5" : "translate-x-0.5"}`} />
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
