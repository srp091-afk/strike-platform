"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { isNavActive, navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-strike font-heading text-sm font-bold text-white">
            S
          </span>
          <span className="font-heading text-lg font-bold tracking-tight text-zinc-900">
            STRIKE
          </span>
        </Link>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((item) => {
            const active = isNavActive(pathname, item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  "relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 font-heading text-sm font-semibold tracking-wide text-zinc-600 transition-all duration-200 hover:bg-zinc-50 hover:text-zinc-900",
                  active && "bg-zinc-100 text-zinc-900",
                )}
              >
                <Icon className="size-4" strokeWidth={2} />
                <span className="hidden md:inline">{item.label}</span>
                {active ? (
                  <span className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-strike" />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
