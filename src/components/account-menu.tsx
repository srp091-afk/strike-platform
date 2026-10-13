"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
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

export function AccountMenu({ account }: { account: AccountProfile }) {
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
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors duration-200 hover:bg-zinc-50"
      >
        {account.avatarUrl && !avatarFailed ? (
          <img
            src={account.avatarUrl}
            alt=""
            className="size-8 rounded-full object-cover"
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <span className="grid size-8 place-items-center rounded-full bg-zinc-900 font-heading text-xs font-semibold text-white">
            {letters}
          </span>
        )}
        <span className="hidden max-w-40 truncate text-left sm:block">
          <span className="block font-heading text-sm font-semibold text-zinc-900">{account.displayName}</span>
          <span className="block truncate text-xs text-zinc-500">{account.email}</span>
        </span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-60 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.18)]"
        >
          <p className="truncate px-2.5 py-2 text-xs text-zinc-500 sm:hidden">{account.email}</p>
          <Link
            role="menuitem"
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
          >
            <Settings className="size-4" strokeWidth={2} />
            Настройки
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={signOut}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-40",
            )}
          >
            <LogOut className="size-4" strokeWidth={2} />
            Выйти
          </button>
        </div>
      ) : null}
    </div>
  );
}
