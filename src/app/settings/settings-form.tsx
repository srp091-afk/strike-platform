"use client";

import { useActionState, useEffect, useState } from "react";

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
  const [editing, setEditing] = useState(false);
  const shownName = name.savedName ?? displayName;

  useEffect(() => {
    if (mail.notice || mail.error) setEditing(true);
  }, [mail.notice, mail.error]);

  return (
    <section className={cardClass}>
      <div>
        <p className="text-sm font-medium text-white">
          <span>Основные данные</span>
        </p>
        <p className="mt-1 text-sm text-zinc-400">
          <span>Имя видно в кабинете. Новый адрес почты начнёт действовать только после ссылки из письма.</span>
        </p>
      </div>
      <div className="flex items-end gap-2">
        <label className="block min-w-0 flex-1 space-y-2">
          <span className="text-sm font-medium text-zinc-400">Email</span>
          <input readOnly value={email} className={readonlyClass} />
        </label>
        <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setEditing((current) => !current)}>
          <span>{editing ? "Скрыть" : "Изменить"}</span>
        </Button>
      </div>
      {pendingEmail ? (
        <p className="rounded-xl border border-zinc-800 bg-black px-3 py-2 text-sm text-zinc-300">
          <span>{`Смена почты на ${pendingEmail} ждёт подтверждения по ссылке из письма. Текущий адрес не меняется, пока ссылка не открыта.`}</span>
        </p>
      ) : null}
      {editing ? (
        <form action={saveMail} className="space-y-4">
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
      ) : null}
      <form action={saveName} className="space-y-5">
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
    </section>
  );
}
