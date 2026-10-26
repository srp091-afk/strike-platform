"use client";

import { usePathname } from "next/navigation";

import { LegalLinks } from "@/components/legal-links";

const HIDDEN_PREFIXES = ["/l/", "/widget/", "/funnels/builder"];
// Эти страницы рисуют собственный подвал с юридическими ссылками.
const HIDDEN_EXACT = ["/", "/login", "/pricing", "/privacy", "/terms", "/refund"];

export function SiteFooter() {
  const pathname = usePathname();
  if (HIDDEN_EXACT.includes(pathname) || HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  return (
    <footer className="mt-auto border-t border-zinc-800 bg-black">
      <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 px-6 py-4 sm:flex-row">
        <p className="font-sans text-xs font-medium uppercase tracking-[0.18em] text-white">STRIKE</p>
        <LegalLinks />
      </div>
    </footer>
  );
}
