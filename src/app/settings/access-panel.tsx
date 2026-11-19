"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { grantAccess, revokeAccess, type DelegationRow } from "@/app/settings/access-actions";
import { Button } from "@/components/ui/button";

const fieldClass =
  "h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white";

export function AccessPanel({ initialRows, loadError }: { initialRows: DelegationRow[]; loadError: string | null }) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(loadError);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function grant() {
    setMessage(null);
    setSaved(false);
    startTransition(async () => {
      const result = await grantAccess(email);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setEmail("");
      setSaved(true);
      router.refresh();
    });
  }

  function revoke(id: string) {
    setMessage(null);
    startTransition(async () => {
      const result = await revokeAccess(id);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setRows((current) => current.filter((row) => row.id !== id));
    });
  }

  return (
    <div className="max-w-lg space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm">
      <div>
        <p className="text-sm font-medium text-zinc-200">Выдать доступ</p>
        <p className="mt-1 text-sm text-zinc-400">Этот человек сможет открыть ваш кабинет из своего меню, без пароля.</p>
      </div>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          placeholder="agency@example.com"
          autoComplete="off"
          className={fieldClass}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (!pending) grant();
          }}
        />
        <Button type="button" disabled={pending} onClick={grant}>
          {pending ? "Сохраняем" : "Выдать доступ"}
        </Button>
      </div>
      {message ? <p className="text-sm text-red-300">{message}</p> : null}
      {saved ? <p className="text-sm text-zinc-300">Доступ выдан.</p> : null}
      <ul className="space-y-2">
        {rows.length === 0 ? <li className="text-sm text-zinc-400">Никому не выдан доступ.</li> : null}
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
            <span className="min-w-0">
              <span className="block truncate text-sm text-white">{row.delegateEmail}</span>
              <span className="block text-xs text-zinc-500">{row.delegateId ? "Аккаунт найден" : "Войдёт, когда зарегистрируется"}</span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => revoke(row.id)}
              className="shrink-0 text-sm font-medium text-red-300 disabled:opacity-40"
            >
              Отозвать
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
