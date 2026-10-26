"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "strike-cookie-consent";
const CHANGE_EVENT = "strike-cookie-consent-change";

type Consent = { necessary: true; analytics: boolean; marketing: boolean; savedAt: string };

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Строка из localStorage (null — выбор ещё не сделан). На сервере считаем, что выбор сделан: баннер не рендерится. */
function readStored() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function save(choice: { analytics: boolean; marketing: boolean }) {
  const consent: Consent = { necessary: true, ...choice, savedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // localStorage недоступен (приватный режим): баннер просто закроется до перезагрузки.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function CookieConsent() {
  const pathname = usePathname();
  const stored = useSyncExternalStore(subscribe, readStored, () => "server");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  // Сохранение могло не пройти (нет localStorage) — тогда прячем баннер локально.
  const [dismissed, setDismissed] = useState(false);

  // Виджет встраивается на чужие сайты — баннер платформы там не нужен.
  if (pathname.startsWith("/widget/")) return null;
  if (stored !== null || dismissed) return null;

  function choose(choice: { analytics: boolean; marketing: boolean }) {
    save(choice);
    setDismissed(true);
  }

  return (
    <div
      role="dialog"
      aria-label="Настройки cookie"
      className="animate-in fixed bottom-4 left-4 z-[100] w-[calc(100%-2rem)] max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a]/95 p-5 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.8)] backdrop-blur-xl"
    >
      <p className="text-sm leading-6 text-zinc-300">
        Мы используем файлы cookie, чтобы платформа работала стабильно и мы могли улучшать сервис. Подробнее в{" "}
        <Link href="/privacy" className="text-white underline underline-offset-4 transition-colors hover:text-strike-soft">
          Политике конфиденциальности
        </Link>
        .
      </p>

      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
          settingsOpen ? "mt-4 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
        aria-hidden={!settingsOpen}
      >
        <div className="overflow-hidden">
          <ul className="grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm">
            <li className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-medium text-white">Необходимые</span>
                <span className="block text-xs text-zinc-500">Вход, безопасность, корзина. Всегда включены.</span>
              </span>
              <Switch checked disabled aria-label="Необходимые cookie" />
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-medium text-white">Аналитика</span>
                <span className="block text-xs text-zinc-500">Помогает понять, как используется сервис.</span>
              </span>
              <Switch
                checked={analytics}
                onCheckedChange={setAnalytics}
                tabIndex={settingsOpen ? 0 : -1}
                aria-label="Аналитические cookie"
              />
            </li>
            <li className="flex items-center justify-between gap-4">
              <span>
                <span className="block font-medium text-white">Маркетинг</span>
                <span className="block text-xs text-zinc-500">Персонализация и измерение рекламы.</span>
              </span>
              <Switch
                checked={marketing}
                onCheckedChange={setMarketing}
                tabIndex={settingsOpen ? 0 : -1}
                aria-label="Маркетинговые cookie"
              />
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => choose({ analytics: true, marketing: true })}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-strike px-5 text-sm font-semibold text-white shadow-[0_0_24px_-6px_rgba(207,2,52,0.7)] transition-all duration-200 hover:brightness-110 active:scale-[0.98]"
        >
          Принять все
        </button>
        {settingsOpen ? (
          <button
            type="button"
            onClick={() => choose({ analytics, marketing })}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-white/15 px-4 text-sm font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/5"
          >
            Сохранить выбор
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-zinc-300 transition-colors hover:bg-white/5 hover:text-white"
          >
            Настроить
          </button>
        )}
      </div>
    </div>
  );
}
