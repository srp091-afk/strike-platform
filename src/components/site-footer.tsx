"use client";

import { usePathname } from "next/navigation";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname.startsWith("/l/") || pathname.startsWith("/funnels/builder")) return null;

  return (
    <footer className="mt-auto border-t border-zinc-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <p className="font-heading text-sm font-semibold tracking-tight text-zinc-900">STRIKE</p>
        <p className="text-xs tracking-wide text-zinc-500">Агенты · Каналы · Чаты</p>
      </div>
    </footer>
  );
}
