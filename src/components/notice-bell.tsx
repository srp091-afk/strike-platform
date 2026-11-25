"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

import type { CabinetNotice } from "@/lib/cabinet-notices";
import { cn } from "@/lib/utils";

export function NoticeBell({
  notices,
  compact = false,
  className,
}: {
  notices: CabinetNotice[];
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const count = notices.length;

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-label={count > 0 ? `Уведомления: ${count}` : "Уведомления"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
        className="relative grid size-8 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <Bell className="size-[18px]" strokeWidth={1.75} />
        {count > 0 ? (
          <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-strike px-1 text-[10px] font-semibold leading-4 text-[#fff]">
            <span>{count > 9 ? "9+" : count}</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={panelId}
          className={cn(
            "absolute z-50 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-[#fff] p-2 shadow-lg",
            compact ? "left-full top-0 ml-2 mt-0" : "right-0 top-full",
          )}
        >
          <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            <span>Уведомления</span>
          </p>
          {count === 0 ? (
            <p className="px-2 py-2 text-sm text-gray-500">
              <span>Пока пусто. Сюда приходят низкий баланс, подписка и сбои каналов — если это включено в настройках.</span>
            </p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {notices.map((notice) => (
                <li key={notice.id}>
                  <Link
                    href={notice.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-2 py-2 hover:bg-gray-50"
                  >
                    <span className={cn("block text-sm font-medium", notice.tone === "warning" ? "text-red-600" : "text-gray-900")}>
                      {notice.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-gray-500">{notice.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
