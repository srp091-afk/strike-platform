import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { LoginPanel } from "@/app/login/login-panel";
import { LegalLinks } from "@/components/legal-links";
import { Logo } from "@/components/ui/Logo";

export const metadata: Metadata = {
  title: "Вход",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center px-4 sm:px-5">
        <Link href="/" aria-label="STRIKE" className="flex items-center">
          <Logo className="text-white" />
        </Link>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-8">
        <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-md sm:p-8">
          <h1 className="text-3xl text-balance">Вход или регистрация</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Авторизуйтесь через Google или введите email. Мы автоматически создадим вам аккаунт или откроем существующий.
          </p>
          <div className="mt-8">
            <Suspense fallback={<div className="h-48" />}>
              <LoginPanel />
            </Suspense>
          </div>
        </div>
        <LegalLinks className="mt-6" />
      </div>
    </div>
  );
}
