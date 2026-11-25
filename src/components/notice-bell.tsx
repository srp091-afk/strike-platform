"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { markNoticesRead } from "@/app/actions/notices";
import { noticeReadKey, type CabinetNotice } from "@/lib/cabinet-notices";
import { cn } from "@/lib/utils";

const readListeners = new Set<(keys: string[]) => void>();

type PanelBox = { top: number; left: number; width: number };

export function NoticeBell({
  notices,
  cabinetId,
  readKeys,
  compact = false,
  className,
}: {
  notices: CabinetNotice[];
  cabinetId: string;
  readKeys: readonly string[];
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<PanelBox | null>(null);
  const [read, setRead] = useState(() => new Set(readKeys));
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const savedKeys = readKeys.join("\n");
  const unread = notices.filter((notice) => cabinetId && !read.has(noticeReadKey(cabinetId, notice.id)));
  const count = unread.length;

  useEffect(() => {
    const incoming = savedKeys.split("\n").filter(Boolean);
    setRead((current) => {
      let changed = false;
      const next = new Set(current);
      for (const key of incoming) {
        if (!next.has(key)) {
          next.add(key);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [savedKeys]);

  useEffect(() => {
    function remember(keys: string[]) {
      setRead((current) => {
        const next = new Set(current);
        for (const key of keys) next.add(key);
        return next;
      });
    }
    readListeners.add(remember);
    return () => {
      readListeners.delete(remember);
    };
  }, []);

  function markVisibleRead() {
    if (!cabinetId) return;
    const pending = notices
      .map((notice) => noticeReadKey(cabinetId, notice.id))
      .filter((key) => !read.has(key));
    if (pending.length === 0) return;
    for (const listener of readListeners) listener(pending);
    void markNoticesRead(pending);
  }

  const opened = useRef(false);
  useEffect(() => {
    if (open && !opened.current) markVisibleRead();
    opened.current = open;
  });

  function place(height = 280) {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const margin = 12;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const besideSidebar = rect.left < window.innerWidth * 0.55;
    let left = besideSidebar ? rect.right + 8 : rect.right - width;
    left = Math.min(Math.max(margin, left), window.innerWidth - margin - width);
    let top = besideSidebar ? rect.top : rect.bottom + 8;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - margin - height);
    setBox({ top, left, width });
  }

  useLayoutEffect(() => {
    if (!open) return;
    const height = panelRef.current?.offsetHeight ?? 280;
    place(height);
  }, [open, count, compact]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onMove() {
      place(panelRef.current?.offsetHeight ?? 280);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open]);

  const panel =
    open && box && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            style={{ top: box.top, left: box.left, width: box.width }}
            className="fixed z-[80] max-h-[min(24rem,calc(100vh-24px))] max-w-[calc(100vw-24px)] overflow-y-auto rounded-xl border border-gray-200 bg-[#fff] p-2 shadow-lg"
          >
            <p className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
              <span>Уведомления</span>
            </p>
            {notices.length === 0 ? (
              <p className="px-2 py-2 text-sm text-gray-500">
                <span>Пока пусто. Сюда приходят низкий баланс, подписка и сбои каналов — если это включено в настройках.</span>
              </p>
            ) : (
              <ul className="space-y-1">
                {notices.map((notice) => (
                  <li key={notice.id}>
                    <Link
                      href={notice.href}
                      onClick={() => {
                        markVisibleRead();
                        setOpen(false);
                      }}
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
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-label={count > 0 ? `Уведомления: ${count}` : "Уведомления"}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) place();
            return next;
          });
        }}
        className="relative grid size-8 place-items-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <Bell className="size-[18px]" strokeWidth={1.75} />
        {count > 0 ? (
          <span className="absolute right-0.5 top-0.5 grid min-w-4 place-items-center rounded-full bg-strike px-1 text-[10px] font-semibold leading-4 text-[#fff]">
            <span>{count > 9 ? "9+" : count}</span>
          </span>
        ) : null}
      </button>
      {panel}
    </div>
  );
}
