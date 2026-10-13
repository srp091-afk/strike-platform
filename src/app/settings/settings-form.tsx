"use client";

import { useActionState } from "react";

import { updateDisplayName, type NameState } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";

const initialState: NameState = { ok: false, error: null, savedName: null };

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
    <form action={action} className="max-w-lg space-y-5 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
      <label className="block space-y-2">
        <span className="text-sm font-medium text-zinc-700">Email</span>
        <input
          readOnly
          value={email}
          className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-600 outline-none"
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-zinc-700">Имя в Google</span>
        <input
          readOnly
          value={googleName}
          className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm text-zinc-600 outline-none"
        />
      </label>
      <label className="block space-y-2">
        <span className="text-sm font-medium text-zinc-700">Отображаемое имя</span>
        <input
          name="display_name"
          key={shownName}
          defaultValue={shownName}
          maxLength={80}
          required
          className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition-all duration-200 focus:border-zinc-300"
        />
      </label>
      {state.error ? <p className="text-sm text-rose-600">{state.error}</p> : null}
      {state.ok ? <p className="text-sm text-emerald-700">Имя сохранено.</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Сохранение" : "Сохранить"}
      </Button>
    </form>
  );
}
