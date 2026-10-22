"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mutate as swrMutate } from "swr";

import { connectTelegramChannel } from "@/app/agents/channels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TelegramType } from "@/lib/agent-models";

const fieldClass =
  "w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none transition-colors duration-200 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-white";

const labelClass = "text-[10px] font-semibold uppercase tracking-widest text-zinc-400";

export type TelegramConnectModalProps = {
  agentId: string;
  /** Предвыбранный тип подключения (по уже сохранённой конфигурации агента). */
  initialType?: TelegramType;
  initialPhone?: string;
  initialApiId?: string;
  onClose: () => void;
  onConnected?: (label: string | null) => void;
};

/**
 * Подключение Telegram к агенту: обычный бот (@BotFather) или личный
 * аккаунт (телефон + API ID / API Hash с my.telegram.org).
 */
export function TelegramConnectModal({
  agentId,
  initialType = "bot",
  initialPhone = "",
  initialApiId = "",
  onClose,
  onConnected,
}: TelegramConnectModalProps) {
  const router = useRouter();
  const [telegramType, setTelegramType] = useState<TelegramType>(initialType);
  const [botToken, setBotToken] = useState("");
  const [phone, setPhone] = useState(initialPhone);
  const [apiId, setApiId] = useState(initialApiId);
  const [apiHash, setApiHash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const botValid = /^\d+:[A-Za-z0-9_-]{20,}$/.test(botToken.trim());
  const phoneValid = /^\+?\d{10,15}$/.test(phone.replace(/[\s()-]/g, ""));
  const userbotValid = phoneValid && /^\d{1,20}$/.test(apiId.trim()) && /^[0-9a-fA-F]{32}$/.test(apiHash.trim());
  const canSubmit = telegramType === "bot" ? botValid : userbotValid;

  function validationError(): string {
    if (telegramType === "bot") return "Укажите токен бота из BotFather.";
    if (!phoneValid) return "Введите номер телефона в международном формате, например +79991234567.";
    if (!/^\d{1,20}$/.test(apiId.trim())) return "API ID — это число с my.telegram.org.";
    return "API Hash — это 32-символьная строка с my.telegram.org.";
  }

  function onSubmit() {
    if (!canSubmit) {
      setError(validationError());
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await connectTelegramChannel(
        agentId,
        telegramType === "bot"
          ? { telegram_type: "bot", telegram_bot_token: botToken }
          : {
              telegram_type: "userbot",
              telegram_phone: phone,
              telegram_api_id: apiId,
              telegram_api_hash: apiHash,
            },
      );
      if (!result.ok) {
        setError(result.error ?? "Не удалось подключить Telegram.");
        return;
      }
      onConnected?.(result.label);
      onClose();
      void swrMutate("/api/agents");
      router.refresh();
    });
  }

  return (
    <div
      data-channel-dialog=""
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="telegram-connect-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800/50 bg-zinc-950 p-6"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Telegram</p>
        <h2 id="telegram-connect-title" className="mt-1 text-2xl font-semibold">
          Подключить Telegram
        </h2>

        <div className="mt-5">
          <Tabs
            value={telegramType}
            onValueChange={(value) => {
              setTelegramType(value === "userbot" ? "userbot" : "bot");
              setError(null);
            }}
          >
            <TabsList className="grid h-auto grid-cols-2" aria-label="Тип подключения Telegram">
              <TabsTrigger value="bot">Telegram Bot</TabsTrigger>
              <TabsTrigger value="userbot">Личный аккаунт</TabsTrigger>
            </TabsList>

            <TabsContent value="bot" className="grid gap-4">
              <label className="grid gap-2">
                <span className={labelClass}>Bot Token</span>
                <input
                  className={fieldClass}
                  type="password"
                  value={botToken}
                  autoComplete="off"
                  placeholder="123456:ABC..."
                  aria-label="Bot Token"
                  onChange={(event) => setBotToken(event.target.value)}
                />
                <span className="text-xs leading-5 text-zinc-400">
                  Получите токен у{" "}
                  <a
                    className="text-white underline underline-offset-2 hover:text-zinc-300"
                    href="https://t.me/BotFather"
                    target="_blank"
                    rel="noreferrer"
                  >
                    @BotFather
                  </a>
                  : /newbot — и вставьте выданный токен сюда.
                </span>
              </label>
            </TabsContent>

            <TabsContent value="userbot" className="grid gap-4">
              <label className="grid gap-2">
                <span className={labelClass}>Номер телефона</span>
                <input
                  className={fieldClass}
                  type="tel"
                  value={phone}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+79991234567"
                  aria-label="Номер телефона"
                  onChange={(event) => setPhone(event.target.value)}
                />
                <span className="text-xs leading-5 text-zinc-400">В международном формате, например +79991234567.</span>
              </label>
              <label className="grid gap-2">
                <span className={labelClass}>API ID</span>
                <input
                  className={fieldClass}
                  value={apiId}
                  autoComplete="off"
                  inputMode="numeric"
                  placeholder="12345678"
                  aria-label="API ID"
                  onChange={(event) => setApiId(event.target.value)}
                />
                <span className="text-xs leading-5 text-zinc-400">
                  Получите API ID и API Hash на{" "}
                  <a
                    className="text-white underline underline-offset-2 hover:text-zinc-300"
                    href="https://my.telegram.org/apps"
                    target="_blank"
                    rel="noreferrer"
                  >
                    my.telegram.org/apps
                  </a>
                  .
                </span>
              </label>
              <label className="grid gap-2">
                <span className={labelClass}>API Hash</span>
                <input
                  className={fieldClass}
                  type="password"
                  value={apiHash}
                  autoComplete="off"
                  placeholder="0123456789abcdef0123456789abcdef"
                  aria-label="API Hash"
                  onChange={(event) => setApiHash(event.target.value)}
                />
              </label>
              <p className="text-xs leading-5 text-zinc-400">
                Данные сохраняются для этого агента. Код подтверждения из Telegram понадобится при первом запуске
                сессии личного аккаунта.
              </p>
            </TabsContent>
          </Tabs>
        </div>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            onClick={onClose}
          >
            Закрыть
          </button>
          <button
            type="button"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:opacity-50"
            disabled={pending}
            onClick={onSubmit}
          >
            {pending ? "Подключение" : "Сохранить / Подключить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TelegramConnectModal;
