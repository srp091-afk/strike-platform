"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { mutate as swrMutate } from "swr";

import { connectTelegramChannel } from "@/app/agents/channels";
import { sendTelegramCode, signInTelegram } from "@/app/agents/telegram-auth";
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
  // MTProto-флоу личного аккаунта: 1 — данные, 2 — код (+ 2FA при needsPassword).
  const [userbotStep, setUserbotStep] = useState<1 | 2>(1);
  const [phoneCodeHash, setPhoneCodeHash] = useState<string | null>(null);
  const [authSession, setAuthSession] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [codePending, setCodePending] = useState(false);
  const [signInPending, setSignInPending] = useState(false);
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
  const codeValid = /^\d{4,8}$/.test(code.replace(/\D/g, ""));

  function userbotValidationError(): string {
    if (!phoneValid) return "Введите номер телефона в международном формате, например +79991234567.";
    if (!/^\d{1,20}$/.test(apiId.trim())) return "API ID — это число с my.telegram.org.";
    return "API Hash — это 32-символьная строка с my.telegram.org.";
  }

  function resetUserbotFlow() {
    setUserbotStep(1);
    setPhoneCodeHash(null);
    setAuthSession(null);
    setCode("");
    setPassword("");
    setNeedsPassword(false);
  }

  function onBotSubmit() {
    if (!botValid) {
      setError("Укажите токен бота из BotFather.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await connectTelegramChannel(agentId, {
        telegram_type: "bot",
        telegram_bot_token: botToken,
      });
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

  async function onSendCode() {
    if (!userbotValid) {
      setError(userbotValidationError());
      return;
    }
    setError(null);
    setCodePending(true);
    try {
      const result = await sendTelegramCode(apiId, apiHash, phone);
      if (!result.ok || !result.phoneCodeHash) {
        setError(result.error ?? "Не удалось отправить код.");
        return;
      }
      setPhoneCodeHash(result.phoneCodeHash);
      setAuthSession(result.session);
      setNeedsPassword(false);
      setCode("");
      setPassword("");
      setUserbotStep(2);
    } catch {
      setError("Не удалось отправить код.");
    } finally {
      setCodePending(false);
    }
  }

  async function onSignIn() {
    if (!phoneCodeHash) {
      resetUserbotFlow();
      setError("Сначала запросите код.");
      return;
    }
    if (!codeValid) {
      setError("Введите код из Telegram.");
      return;
    }
    if (needsPassword && !password.trim()) {
      setError("Введите облачный пароль (2FA).");
      return;
    }
    setError(null);
    setSignInPending(true);
    try {
      const result = await signInTelegram(
        agentId,
        apiId,
        apiHash,
        phone,
        phoneCodeHash,
        code,
        password.trim() ? password : undefined,
        authSession ?? undefined,
      );
      if (result.needsPassword) {
        setNeedsPassword(true);
        if (result.session) setAuthSession(result.session);
        setError("У аккаунта включена двухфакторная защита. Введите облачный пароль (2FA).");
        return;
      }
      if (!result.ok) {
        setError(result.error ?? "Не удалось подключить Telegram.");
        return;
      }
      onConnected?.(result.label);
      onClose();
      void swrMutate("/api/agents");
      router.refresh();
    } catch {
      setError("Не удалось подключить Telegram.");
    } finally {
      setSignInPending(false);
    }
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
              resetUserbotFlow();
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
              <p className="text-xs font-medium tracking-wide text-zinc-400">
                {userbotStep === 1 ? "Шаг 1 из 2 — данные аккаунта" : "Шаг 2 из 2 — подтверждение входа"}
              </p>
              {userbotStep === 1 ? (
                <>
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
                    Нажмите «Получить код» — Telegram пришлёт код подтверждения на этот номер.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm leading-6 text-zinc-400">
                    Код отправлен на <span className="font-medium text-white">{phone}</span>. Введите его ниже
                    {needsPassword ? " и облачный пароль (2FA)" : ""}.
                  </p>
                  <label className="grid gap-2">
                    <span className={labelClass}>Код из Telegram</span>
                    <input
                      className={fieldClass}
                      value={code}
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      placeholder="12345"
                      aria-label="Код из Telegram"
                      autoFocus
                      onChange={(event) => setCode(event.target.value)}
                    />
                  </label>
                  {needsPassword ? (
                    <label className="grid gap-2">
                      <span className={labelClass}>Облачный пароль (2FA)</span>
                      <input
                        className={fieldClass}
                        type="password"
                        value={password}
                        autoComplete="current-password"
                        placeholder="Пароль двухфакторной защиты"
                        aria-label="Облачный пароль (2FA)"
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    </label>
                  ) : null}
                  <button
                    type="button"
                    className="justify-self-start text-sm font-medium text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
                    disabled={codePending}
                    onClick={() => void onSendCode()}
                  >
                    {codePending ? "Отправка" : "Отправить код повторно"}
                  </button>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          {telegramType === "userbot" && userbotStep === 2 ? (
            <button
              type="button"
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
              onClick={() => {
                resetUserbotFlow();
                setError(null);
              }}
            >
              Назад
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            onClick={onClose}
          >
            Закрыть
          </button>
          {telegramType === "bot" ? (
            <button
              type="button"
              className="rounded-xl bg-strike px-4 py-2.5 text-sm font-semibold text-white transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(207,2,52,0.45)] disabled:opacity-50"
              disabled={pending}
              onClick={onBotSubmit}
            >
              {pending ? "Подключение" : "Сохранить / Подключить"}
            </button>
          ) : userbotStep === 1 ? (
            <button
              type="button"
              className="rounded-xl bg-strike px-4 py-2.5 text-sm font-semibold text-white transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(207,2,52,0.45)] disabled:opacity-50"
              disabled={codePending}
              onClick={() => void onSendCode()}
            >
              {codePending ? "Отправка" : "Получить код"}
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl bg-strike px-4 py-2.5 text-sm font-semibold text-white transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(207,2,52,0.45)] disabled:opacity-50"
              disabled={signInPending}
              onClick={() => void onSignIn()}
            >
              {signInPending ? "Подключение" : "Подключить"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default TelegramConnectModal;
