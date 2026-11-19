"use client";

import { useEffect, useState, useTransition } from "react";

import { readTwilioConfig, saveTwilioConfig } from "@/app/agents/twilio-config";

const WEBHOOK_URL = "https://www.strikeplatform.io/api/webhooks/twilio/inbound";

const fieldClass =
  "w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white";

export function TwilioConnectCard() {
  const [accountSid, setAccountSid] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [hasToken, setHasToken] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void readTwilioConfig().then((result) => {
      if (cancelled || !result.ok) return;
      setAccountSid(result.accountSid);
      setWhatsappNumber(result.whatsappNumber);
      setHasToken(result.hasToken);
      setSaved(result.hasToken);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function save() {
    setMessage(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveTwilioConfig({ accountSid, authToken, whatsappNumber });
      if (!result.ok) {
        setMessage(result.error ?? "Не удалось сохранить аккаунт Twilio.");
        return;
      }
      setAuthToken("");
      setHasToken(true);
      setSaved(true);
    });
  }

  async function copyWebhook() {
    try {
      const write = navigator.clipboard?.writeText(WEBHOOK_URL);
      if (!write) throw new Error("clipboard");
      await Promise.race([
        write,
        new Promise((_, reject) => window.setTimeout(() => reject(new Error("timeout")), 700)),
      ]);
    } catch {
      const area = document.createElement("textarea");
      area.value = WEBHOOK_URL;
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand("copy");
      area.remove();
      if (!ok) {
        setMessage("Не удалось скопировать адрес. Выделите его вручную.");
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="grid gap-4 rounded-xl border border-zinc-800 bg-black/40 px-4 py-4"
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        if (!pending) save();
      }}
    >
      <div>
        <p className="text-sm font-medium text-zinc-200">WhatsApp Business (Twilio)</p>
        <p className="mt-1 text-sm text-zinc-400">Один аккаунт на весь кабинет. С него уходят шаблоны и ответы агента.</p>
      </div>
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Account SID
        <input className={fieldClass} value={accountSid} autoComplete="off" spellCheck={false} onChange={(event) => setAccountSid(event.target.value)} />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Auth Token
        <input
          className={fieldClass}
          type="password"
          value={authToken}
          autoComplete="new-password"
          placeholder={hasToken ? "Токен сохранён. Введите новый, чтобы заменить." : ""}
          onChange={(event) => setAuthToken(event.target.value)}
        />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Номер WhatsApp
        <input
          className={fieldClass}
          inputMode="tel"
          value={whatsappNumber}
          placeholder="+1234567890"
          autoComplete="off"
          onChange={(event) => setWhatsappNumber(event.target.value)}
        />
      </label>
      <div className="grid gap-1.5">
        <p className="text-xs font-medium text-zinc-400">Webhook URL</p>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white">{WEBHOOK_URL}</p>
          <button
            type="button"
            className="shrink-0 rounded-xl border border-zinc-700 px-3 py-3 text-sm font-medium text-white"
            onClick={() => void copyWebhook()}
          >
            {copied ? "Скопировано" : "Скопировать"}
          </button>
        </div>
      </div>
      {message ? <p className="text-sm text-red-400">{message}</p> : null}
      {saved ? <p className="text-sm text-zinc-300">Аккаунт Twilio проверен и сохранён.</p> : null}
      <button
        type="button"
        className="w-full rounded-xl bg-strike px-4 py-2.5 text-sm font-semibold text-white transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(207,2,52,0.45)] disabled:opacity-50"
        disabled={pending}
        onClick={save}
      >
        {pending ? "Проверяем Twilio..." : "Сохранить и проверить"}
      </button>
    </div>
  );
}
