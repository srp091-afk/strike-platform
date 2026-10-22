"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/account-menu";
import { isNavActive, navItems } from "@/lib/navigation";
import type { AccountProfile } from "@/lib/auth-user";
import { cn } from "@/lib/utils";

export function SiteHeader({ account }: { account: AccountProfile | null }) {
  const pathname = usePathname();
  if (pathname.startsWith("/l/") || pathname.startsWith("/widget/") || pathname === "/login") return null;

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-8 px-4 sm:px-6">
        <Link
          href="/"
          className="shrink-0 font-sans text-sm font-medium uppercase tracking-[0.18em] text-white"
        >
          STRIKE
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const active = isNavActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 shrink-0 items-center px-3 text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-200",
                  active && "text-white",
                )}
              >
                {item.label}
                {active ? <span className="absolute inset-x-3 bottom-0 h-px bg-white" /> : null}
              </Link>
            );
          })}
        </nav>
        {account ? <AccountMenu account={account} /> : null}
      </div>
    </header>
  );
}
