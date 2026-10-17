"use client";

import { useActionState } from "react";

import { updateDisplayName, type NameState } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";

const initialState: NameState = { ok: false, error: null, savedName: null };

const readonlyClass =
  "h-11 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-400 outline-none";

const fieldClass =
  "h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white";

export function SettingsForm({
  email,
  googleName,
  displayName,
}: {
  email: string;
  googleName: string;
  displayName: string;
}) {
  const [state, action, pending] = useActionState(updateDisplayName, initialState);
  const shownName = state.savedName ?? displayName;

  return (
    <form action={action} className="max-w-lg space-y-5 rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-md">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-zinc-400">Email</span>
        <input readOnly value={email} className={readonlyClass} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-zinc-400">Имя в Google</span>
        <input readOnly value={googleName} className={readonlyClass} />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-zinc-400">Отображаемое имя</span>
        <input
          name="display_name"
          key={shownName}
          defaultValue={shownName}
          maxLength={80}
          required
          className={fieldClass}
        />
      </label>
      {state.error ? <p className="text-sm text-red-300">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-zinc-300">Имя сохранено.</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Сохранение" : "Сохранить"}
      </Button>
    </form>
  );
}
