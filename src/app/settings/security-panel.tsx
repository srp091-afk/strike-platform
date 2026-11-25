"use client";

import { useActionState, useRef, useState, type Ref } from "react";

import { updatePassword, type NoticeState } from "@/app/settings/actions";
import type { SignInMethod } from "@/lib/auth-user";
import { Button } from "@/components/ui/button";

import { cardClass, fieldClass, SettingsStatus } from "./settings-ui";

const initialState: NoticeState = { ok: false, error: null, notice: null };

export function SecurityPanel({ methods }: { methods: SignInMethod[] }) {
  const [state, action, pending] = useActionState(updatePassword, initialState);
  const [visible, setVisible] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordReady = methods.includes("email");
  const googleReady = methods.includes("google");

  function focusNewPassword() {
    const field = passwordRef.current;
    if (!field) return;
    field.scrollIntoView({ behavior: "smooth", block: "center" });
    field.focus({ preventScroll: true });
  }

  return (
    <div className="space-y-4">
      <section className={cardClass}>
        <div>
          <p className="text-sm font-medium text-white">
            <span>Способы входа</span>
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            <span>Чем сейчас можно открыть этот аккаунт.</span>
          </p>
        </div>
        <ul className="space-y-3">
          <li className="flex items-start justify-between gap-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-200">Google</span>
              <span className="mt-0.5 block text-sm text-zinc-500">
                {googleReady ? "OAuth подключён. Вход через Google остаётся." : "OAuth не подключён."}
              </span>
            </span>
            <span className="shrink-0 text-sm text-zinc-300">{googleReady ? "Активен" : "Нет"}</span>
          </li>
          <li className="flex items-start justify-between gap-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-zinc-200">Email и пароль</span>
              <span className="mt-0.5 block text-sm text-zinc-500">
                {passwordReady
                  ? "Пароль задан. Можно входить по почте, даже если Google недоступен."
                  : "Пароль ещё не задан. Это запасной вход, если Google недоступен."}
              </span>
            </span>
            <span className="shrink-0 text-sm text-zinc-300">{passwordReady ? "Активен" : "Нет"}</span>
          </li>
        </ul>
        {passwordReady ? null : (
          <button type="button" onClick={focusNewPassword} className="text-left text-sm font-medium text-strike">
            <span>Задать пароль для резервного входа</span>
          </button>
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
          <PasswordField
            inputRef={passwordRef}
            id="settings-new-password"
            name="password"
            visible={visible}
            autoComplete="new-password"
          />
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-zinc-400">Подтвердите пароль</span>
          <PasswordField name="confirm" visible={visible} autoComplete="new-password" />
        </label>
        <div className="flex flex-col gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm font-medium text-zinc-300">
            <input
              type="checkbox"
              checked={visible}
              onChange={(event) => setVisible(event.target.checked)}
              className="size-4 accent-[#cf0234]"
            />
            <span>{visible ? "Скрыть пароль" : "Показать пароль"}</span>
          </label>
          <SettingsStatus error={state.error} notice={state.notice} />
          <Button type="submit" disabled={pending}>
            <span>{pending ? "Сохранение" : passwordReady ? "Обновить пароль" : "Установить пароль"}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}

function PasswordField({
  name,
  visible,
  autoComplete,
  id,
  inputRef,
}: {
  name: string;
  visible: boolean;
  autoComplete: string;
  id?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={inputRef}
      id={id}
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
