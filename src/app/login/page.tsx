import type { Metadata } from "next";
import { Suspense } from "react";

import { LoginPanel } from "@/app/login/login-panel";
import { LegalLinks } from "@/components/legal-links";

export const metadata: Metadata = {
  title: "Вход",
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-8 backdrop-blur-md">
        <p className="font-sans text-sm font-medium uppercase tracking-[0.18em] text-white">STRIKE</p>
        <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-strike/25 bg-strike/10 px-3 py-1 text-xs font-medium text-strike-soft">
          <span className="size-1.5 rounded-full bg-strike shadow-[0_0_8px_rgba(207,2,52,0.9)]" />
          Start your 7-day free trial
        </p>
        <h1 className="mt-4 text-3xl">Вход</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Войдите, чтобы открыть агентов, чаты и воронки.
        </p>
        <div className="mt-8">
          <Suspense fallback={<div className="h-48" />}>
            <LoginPanel />
          </Suspense>
        </div>
      </div>
      <LegalLinks className="mt-6" />
    </div>
  );
}
