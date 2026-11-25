"use client";

import { useActionState, useState } from "react";

import { saveWorkspace, type NoticeState } from "@/app/settings/actions";
import { TimeZoneField, useEffectiveTimeZone } from "@/components/outreach/timezone-field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { NotificationSettings } from "@/lib/auth-user";

import { cardClass, SettingsStatus } from "./settings-ui";

const initialState: NoticeState = { ok: false, error: null, notice: null };

export function PreferencesPanel({
  notifications,
  timezone,
}: {
  notifications: NotificationSettings;
  timezone: string | null;
}) {
  const detected = useEffectiveTimeZone(timezone, timezone == null);
  const [zone, setZone] = useState<string | null>(null);
  const [lowBalance, setLowBalance] = useState(notifications.lowBalance);
  const [subscription, setSubscription] = useState(notifications.subscription);
  const [channelAlerts, setChannelAlerts] = useState(notifications.channelAlerts);
  const [state, action, pending] = useActionState(saveWorkspace, initialState);
  const selectedZone = zone ?? detected;

  return (
    <form action={action} className={cardClass}>
      <div>
        <p className="text-sm font-medium text-white">
          <span>Уведомления</span>
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          <span>Что показывать и присылать по этому аккаунту.</span>
        </p>
      </div>
      <input type="hidden" name="low_balance" value={lowBalance ? "on" : ""} />
      <input type="hidden" name="subscription" value={subscription ? "on" : ""} />
      <input type="hidden" name="channel_alerts" value={channelAlerts ? "on" : ""} />
      <input type="hidden" name="timezone" value={selectedZone} />
      <Toggle
        label="Низкий баланс"
        hint="Предупреждение, когда STRIKE Credits меньше 100."
        checked={lowBalance}
        onChange={setLowBalance}
      />
      <Toggle
        label="Подписка"
        hint="Статус тарифа и напоминание о продлении."
        checked={subscription}
        onChange={setSubscription}
      />
      <Toggle
        label="Каналы"
        hint="Если отключится или сломается WhatsApp, Instagram или виджет."
        checked={channelAlerts}
        onChange={setChannelAlerts}
      />
      <div className="space-y-2">
        <span className="block text-sm font-medium text-zinc-400">Часовой пояс</span>
        <TimeZoneField value={selectedZone} disabled={pending} onChange={setZone} />
        <p className="text-xs text-zinc-500">
          <span>{timezone ? "Сохранённый пояс." : "Пока не сохранён: показан пояс браузера, иначе UTC."}</span>
        </p>
      </div>
      <SettingsStatus error={state.error} notice={state.notice} />
      <Button type="submit" disabled={pending}>
        <span>{pending ? "Сохранение" : "Сохранить"}</span>
      </Button>
    </form>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-zinc-200">{label}</span>
        <span className="mt-0.5 block text-sm text-zinc-500">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}
