import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { PageFrame } from "@/components/page-frame";
import { getAccountProfile } from "@/lib/auth-user";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Профиль",
};

export default function SettingsPage() {
  return (
    <PageFrame
      eyebrow="Аккаунт"
      title="Профиль"
      description="Email и имя из Google. Отображаемое имя можно изменить."
    >
      <Suspense fallback={<div className="h-64 max-w-lg rounded-2xl border border-zinc-800/50 bg-zinc-900/50" />}>
        <SettingsData />
      </Suspense>
    </PageFrame>
  );
}

async function SettingsData() {
  await io();
  const account = await getAccountProfile();
  if (!account) {
    return <p className="text-sm text-zinc-400">Нужно войти через Google.</p>;
  }

  return (
    <SettingsForm email={account.email} googleName={account.googleName} displayName={account.displayName} />
  );
}
