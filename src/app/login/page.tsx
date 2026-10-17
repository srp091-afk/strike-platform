import type { Metadata } from "next";

import { GoogleSignInButton } from "@/app/login/google-sign-in";

export const metadata: Metadata = {
  title: "Вход",
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-8 backdrop-blur-md">
        <p className="font-sans text-sm font-medium uppercase tracking-[0.18em] text-white">STRIKE</p>
        <h1 className="mt-3 text-3xl">Вход</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Войдите через Google, чтобы открыть агентов, чаты и воронки.
        </p>
        <div className="mt-8">
          <GoogleSignInButton />
        </div>
      </div>
    </div>
  );
}
