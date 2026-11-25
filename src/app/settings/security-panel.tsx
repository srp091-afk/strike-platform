"use client";

import { useActionState, useState } from "react";

import { updatePassword, type NoticeState } from "@/app/settings/actions";
import type { SignInMethod } from "@/lib/auth-user";
import { Button } from "@/components/ui/button";

import { cardClass, fieldClass, SettingsStatus } from "./settings-ui";

const initialState: NoticeState = { ok: false, error: null, notice: null };

const METHOD_LABEL: Record<SignInMethod, string> = {
  email: "Email и пароль",
  google: "Google",
};

export function SecurityPanel({ methods }: { methods: SignInMethod[] }) {
  const [state, action, pending] = useActionState(updatePassword, initialState);
  const [visible, setVisible] = useState(false);
  const passwordReady = methods.includes("email");

  return (
    <div className="space-y-4">
      <section className={cardClass}>
        <div>
          <p className="text-sm font-medium text-white">
            <span>Способы входа</span>
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            <span>Так можно открыть этот аккаунт.</span>
          </p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {methods.map((method) => (
            <li key={method} className="rounded-full border border-zinc-700 bg-black px-3 py-1 text-sm text-white">
              <span>{METHOD_LABEL[method]}</span>
            </li>
          ))}
        </ul>
        {passwordReady ? null : (
          <p className="text-sm text-zinc-400">
            <span>Пароль ещё не задан. После установки вход по email останется доступен вместе с Google.</span>
          </p>
        )}
      </section>

      <form action={action} className={cardClass}>
        <div>
          <p className="text-sm font-medium text-white">
            <span>{passwordReady ? "Сменить пароль" : "Установить пароль"}</span>
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            <span>Старый пароль не нужен. Минимум 8 символов.</span>
          </p>
        </div>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-400">Новый пароль</span>
          <PasswordField name="password" visible={visible} autoComplete="new-password" />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-400">Подтвердите пароль</span>
          <PasswordField name="confirm" visible={visible} autoComplete="new-password" />
        </label>
        <button
          type="button"
          className="text-sm font-medium text-zinc-300"
          onClick={() => setVisible((current) => !current)}
        >
          <span>{visible ? "Скрыть пароль" : "Показать пароль"}</span>
        </button>
        <SettingsStatus error={state.error} notice={state.notice} />
        <Button type="submit" disabled={pending}>
          <span>{pending ? "Сохранение" : passwordReady ? "Сменить пароль" : "Установить пароль"}</span>
        </Button>
      </form>
    </div>
  );
}

function PasswordField({
  name,
  visible,
  autoComplete,
}: {
  name: string;
  visible: boolean;
  autoComplete: string;
}) {
  return (
    <input
      name={name}
      type={visible ? "text" : "password"}
      required
      minLength={8}
      maxLength={72}
      autoComplete={autoComplete}
      className={fieldClass}
    />
  );
}
