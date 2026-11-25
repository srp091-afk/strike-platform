"use client";

import { useActionState } from "react";

import { requestEmailChange, updateDisplayName, type NameState, type NoticeState } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";

import { cardClass, fieldClass, SettingsStatus } from "./settings-ui";

const nameState: NameState = { ok: false, error: null, savedName: null };
const emailState: NoticeState = { ok: false, error: null, notice: null };

const readonlyClass =
  "h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-400 outline-none";

export function SettingsForm({
  email,
  pendingEmail,
  googleName,
  displayName,
}: {
  email: string;
  pendingEmail: string | null;
  googleName: string;
  displayName: string;
}) {
  const [name, saveName, namePending] = useActionState(updateDisplayName, nameState);
  const [mail, saveMail, mailPending] = useActionState(requestEmailChange, emailState);
  const shownName = name.savedName ?? displayName;

  return (
    <div className="space-y-4">
      <form action={saveName} className={cardClass}>
        <div>
          <p className="text-sm font-medium text-white">
            <span>Основные данные</span>
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            <span>Имя видно в кабинете. Почта Google остаётся справочной.</span>
          </p>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-400">Email</span>
          <input readOnly value={email} className={readonlyClass} />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-400">Имя в Google</span>
          <input readOnly value={googleName || "—"} className={readonlyClass} />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-400">Отображаемое имя</span>
          <input name="display_name" key={shownName} defaultValue={shownName} maxLength={80} required className={fieldClass} />
        </label>
        <SettingsStatus error={name.error} notice={name.ok ? "Имя сохранено." : null} />
        <Button type="submit" disabled={namePending}>
          <span>{namePending ? "Сохранение" : "Сохранить имя"}</span>
        </Button>
      </form>

      <form action={saveMail} className={cardClass}>
        <div>
          <p className="text-sm font-medium text-white">
            <span>Смена почты</span>
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            <span>Новый адрес начнёт действовать только после перехода по ссылке из письма.</span>
          </p>
        </div>
        {pendingEmail ? (
          <p className="rounded-xl border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-300">
            <span>{`Ждём подтверждение для ${pendingEmail}.`}</span>
          </p>
        ) : null}
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-400">Новый email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="name@company.com"
            className={fieldClass}
          />
        </label>
        <SettingsStatus error={mail.error} notice={mail.notice} />
        <Button type="submit" disabled={mailPending}>
          <span>{mailPending ? "Отправляем" : "Отправить подтверждение"}</span>
        </Button>
      </form>
    </div>
  );
}
