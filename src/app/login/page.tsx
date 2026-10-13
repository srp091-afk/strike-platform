import type { Metadata } from "next";

import { GoogleSignInButton } from "@/app/login/google-sign-in";

export const metadata: Metadata = {
  title: "Вход",
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center px-4 py-16">
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
        <p className="font-heading text-sm font-semibold tracking-wide text-strike">STRIKE</p>
        <h1 className="mt-3 text-3xl">Вход</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Войдите через Google, чтобы открыть агентов, чаты и воронки.
        </p>
        <div className="mt-8">
          <GoogleSignInButton />
        </div>
      </div>
    </div>
  );
}
