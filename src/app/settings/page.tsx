import type { Metadata } from "next";
import { Suspense } from "react";
import { io } from "next/cache";

import { PageFrame } from "@/components/page-frame";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAccountProfile } from "@/lib/auth-user";

import { listOwnedDelegations } from "./access-actions";
import { AccessPanel } from "./access-panel";
import { PreferencesPanel } from "./preferences-panel";
import { SecurityPanel } from "./security-panel";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = {
  title: "Профиль",
};

export default function SettingsPage() {
  return (
    <PageFrame
      eyebrow="Аккаунт"
      title="Профиль"
      description="Имя, почта, пароль, уведомления и доступ к кабинету."
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
    return (
      <p className="text-sm text-zinc-400">
        <span>Нужно войти в аккаунт.</span>
      </p>
    );
  }
  const access = await listOwnedDelegations();

  return (
    <Tabs defaultValue="profile" className="max-w-2xl">
      <TabsList className="h-auto justify-start overflow-x-auto">
        <TabsTrigger value="profile" className="shrink-0">
          <span>Профиль</span>
        </TabsTrigger>
        <TabsTrigger value="security" className="shrink-0">
          <span>Безопасность</span>
        </TabsTrigger>
        <TabsTrigger value="notifications" className="shrink-0">
          <span>Уведомления</span>
        </TabsTrigger>
        <TabsTrigger value="access" className="shrink-0">
          <span>Доступы</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="profile">
        <SettingsForm
          email={account.email}
          pendingEmail={account.pendingEmail}
          googleName={account.googleName}
          displayName={account.displayName}
        />
      </TabsContent>
      <TabsContent value="security">
        <SecurityPanel methods={account.signInMethods} />
      </TabsContent>
      <TabsContent value="notifications">
        <PreferencesPanel notifications={account.notifications} timezone={account.timezone} />
      </TabsContent>
      <TabsContent value="access">
        <AccessPanel key={access.rows.map((row) => row.id).join()} initialRows={access.rows} loadError={access.error} />
      </TabsContent>
    </Tabs>
  );
}
