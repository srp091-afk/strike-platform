"use client";

import { useEffect, useState } from "react";

type ToastKind = "success" | "error";

type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
  expiresAt: number;
};

const eventName = "strike-toast";

function queue(): ToastItem[] {
  const host = window as Window & { __strikeToasts?: ToastItem[] };
  host.__strikeToasts ??= [];
  return host.__strikeToasts;
}

function emit(kind: ToastKind, message: string) {
  if (typeof window === "undefined") return;
  const item: ToastItem = {
    id: crypto.randomUUID(),
    kind,
    message,
    expiresAt: Date.now() + 4000,
  };
  queue().push(item);
  window.dispatchEvent(new CustomEvent(eventName));
  window.setTimeout(() => {
    const list = queue();
    const index = list.findIndex((entry) => entry.id === item.id);
    if (index >= 0) list.splice(index, 1);
    window.dispatchEvent(new CustomEvent(eventName));
  }, 4000);
}

export const toast = {
  success(message: string) {
    emit("success", message);
  },
  error(message: string) {
    emit("error", message);
  },
};

export function Toaster() {
  const [visible, setVisible] = useState<ToastItem[]>([]);

  useEffect(() => {
    function sync() {
      setVisible(queue().filter((item) => item.expiresAt > Date.now()));
    }

    window.addEventListener(eventName, sync);
    sync();
    return () => window.removeEventListener(eventName, sync);
  }, []);

  if (visible.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[80] flex flex-col items-center gap-2 px-4">
      {visible.map((item) => (
        <p
          key={item.id}
          role="status"
          className={
            item.kind === "error"
              ? "pointer-events-auto rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 shadow-lg"
              : "pointer-events-auto rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg"
          }
        >
          {item.message}
        </p>
      ))}
    </div>
  );
}
