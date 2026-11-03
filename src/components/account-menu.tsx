"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { AccountProfile } from "@/lib/auth-user";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { cn } from "@/lib/utils";

function initials(name: string, email: string) {
  const source = name.trim() || email.trim() || "S";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/** Профиль внизу сайдбара: аватар, имя и меню выхода. В свёрнутом сайдбаре остаётся только аватар. */
export function AccountMenu({ account, collapsed = false }: { account: AccountProfile; collapsed?: boolean }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const letters = initials(account.displayName, account.email);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setPending(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? account.displayName : undefined}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-gray-100",
          collapsed && "justify-center",
        )}
      >
        {account.avatarUrl && !avatarFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={account.avatarUrl}
            alt=""
            className="size-8 shrink-0 rounded-full object-cover"
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-gray-900 font-heading text-xs font-semibold text-gray-50">
            {letters}
          </span>
        )}
        {collapsed ? null : (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-heading text-sm font-semibold text-gray-900">{account.displayName}</span>
            <span className="block truncate text-xs text-gray-500">{account.email}</span>
          </span>
        )}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute bottom-[calc(100%+0.5rem)] z-50 w-56 rounded-xl border border-gray-200 bg-[#fff] p-1.5 shadow-lg",
            collapsed ? "left-0" : "inset-x-0 w-auto",
          )}
        >
          <p className="truncate px-2.5 py-2 text-xs text-gray-500">{account.email}</p>
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-40"
          >
            <LogOut className="size-4" strokeWidth={2} />
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}
