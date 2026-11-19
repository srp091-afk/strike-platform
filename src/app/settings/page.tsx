import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { PageFrame } from "@/components/page-frame";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAccountProfile } from "@/lib/auth-user";

import { listOwnedDelegations } from "./access-actions";
import { AccessPanel } from "./access-panel";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Профиль",
};

export default function SettingsPage() {
  return (
    <PageFrame
      eyebrow="Аккаунт"
      title="Профиль"
      description="Email, имя и доступ к кабинету."
    >
      <Suspense fallback={<div className="h-64 max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm" />}>
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
  const access = await listOwnedDelegations();

  return (
    <Tabs defaultValue="profile" className="max-w-lg">
      <TabsList>
        <TabsTrigger value="profile">Профиль</TabsTrigger>
        <TabsTrigger value="access">Доступы</TabsTrigger>
      </TabsList>
      <TabsContent value="profile">
        <SettingsForm email={account.email} googleName={account.googleName} displayName={account.displayName} />
      </TabsContent>
      <TabsContent value="access">
        <AccessPanel key={access.rows.map((row) => row.id).join()} initialRows={access.rows} loadError={access.error} />
      </TabsContent>
    </Tabs>
  );
}
