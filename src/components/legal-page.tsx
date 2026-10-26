import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { LegalLinks } from "@/components/legal-links";

/** Типографика юридических текстов (аналог prose): заголовки, абзацы, списки и ссылки. */
const PROSE = [
  "text-[15px] leading-7 text-zinc-400",
  "[&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white",
  "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-white",
  "[&_p]:my-4",
  "[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1.5 [&_li]:marker:text-zinc-600",
  "[&_a]:text-strike-soft [&_a]:underline [&_a]:underline-offset-4 [&_a]:transition-colors [&_a:hover]:text-white",
  "[&_strong]:font-semibold [&_strong]:text-zinc-200",
].join(" ");

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-black text-zinc-400">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(207,2,52,0.14),transparent_70%)]"
      />
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
        <Link href="/" aria-label="STRIKE" className="flex items-center">
          <BrandLogo />
        </Link>
        <Link href="/pricing" className="text-sm text-zinc-400 transition-colors hover:text-white">
          Тарифы
        </Link>
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 pt-12 pb-24 sm:px-6">
        <h1 className="bg-gradient-to-b from-white to-zinc-500 bg-clip-text pb-2 text-4xl leading-[1.15] font-semibold tracking-tight text-transparent sm:text-5xl">
          {title}
        </h1>
        <p className="mt-3 text-sm text-zinc-500">Последнее обновление: {updated}</p>
        <article className={`mt-10 border-t border-white/10 pt-2 ${PROSE}`}>{children}</article>
      </div>

      <footer className="border-t border-white/5 py-8">
        <LegalLinks />
        <p className="mt-4 text-center text-xs text-zinc-600">&copy; STRIKE. Все права защищены.</p>
      </footer>
    </div>
  );
}
