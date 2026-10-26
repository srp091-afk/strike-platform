"use client";

import { usePathname } from "next/navigation";

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/" || pathname === "/login" || pathname === "/pricing" || pathname.startsWith("/l/") || pathname.startsWith("/widget/") || pathname.startsWith("/funnels/builder")) return null;

  return (
    <footer className="mt-auto border-t border-zinc-800 bg-black">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.18em] text-white">STRIKE</p>
        <p className="text-xs tracking-wide text-zinc-500">Агенты · Каналы · Чаты</p>
      </div>
    </footer>
  );
}
