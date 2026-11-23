"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  confirmWhatsAppAuthorization,
  requestWhatsAppLinkCode,
  requestWhatsAppQr,
} from "@/app/agents/channels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type GreenDefaults = {
  instanceId: string;
  apiToken: string;
};

const fieldClass =
  "w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white";

export function WhatsAppConnectDialog({
  agentId,
  defaults,
  evolution = false,
  initialTab = "qr",
  initialPhone = "",
  onApply,
  onPhone,
  onClose,
}: {
  agentId: string;
  defaults: GreenDefaults;
  evolution?: boolean;
  initialTab?: "qr" | "phone";
  initialPhone?: string;
  onApply: (credentials: GreenDefaults) => void;
  onPhone?: (phone: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [instanceId, setInstanceId] = useState(defaults.instanceId);
  const [apiToken, setApiToken] = useState(defaults.apiToken);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState(initialPhone);
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [alreadyAuthorized, setAlreadyAuthorized] = useState(false);
  const [watching, setWatching] = useState(false);
  const [qrPending, setQrPending] = useState(false);
  const [codePending, setCodePending] = useState(false);
  const [activeTab, setActiveTab] = useState<"qr" | "phone">(initialTab);
  const requestId = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const onPhoneRef = useRef(onPhone);
  onPhoneRef.current = onPhone;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCloseRef.current();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!watching) return;
    let cancelled = false;

    async function tick() {
      const result = await confirmWhatsAppAuthorization({
        instanceId,
        apiToken,
        agentId,
        phoneNumber,
      });
      if (cancelled) return;
      if (result.error) {
        setMessage(result.error);
        if (result.authorized) setWatching(false);
        return;
      }
      setMessage(null);
      if (result.authorized) {
        if ("instanceId" in result && result.instanceId && "apiToken" in result && result.apiToken) {
          onApplyRef.current({ instanceId: result.instanceId, apiToken: result.apiToken });
        }
        if ("phone" in result && result.phone) onPhoneRef.current?.(result.phone);
        setWatching(false);
        onCloseRef.current();
        router.refresh();
      }
    }

    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [watching, instanceId, apiToken, agentId, phoneNumber, router]);

  function resetFlow() {
    requestId.current += 1;
    setWatching(false);
    setQrImage(null);
    setLinkCode(null);
    setMessage(null);
    setAlreadyAuthorized(false);
    setQrPending(false);
    setCodePending(false);
  }

  function credentialsError() {
    if (evolution) return null;
    if (!/^\d{4,}$/.test(instanceId.trim()) || apiToken.trim().length < 8) {
      setSettingsOpen(true);
      return "Укажите Instance ID и API Token в настройках инстанса.";
    }
    return null;
  }

  const showQrRef = useRef<() => Promise<void>>(async () => {});

  async function showQr() {
    const invalid = credentialsError();
    if (invalid) {
      setMessage(invalid);
      return;
    }
    const id = ++requestId.current;
    setMessage(null);
    setAlreadyAuthorized(false);
    setQrImage(null);
    setQrPending(true);
    try {
      const result = await requestWhatsAppQr(instanceId, apiToken, agentId);
      if (id !== requestId.current) return;
      setQrPending(false);
      if (result.alreadyAuthorized) {
        setAlreadyAuthorized(true);
        setWatching(evolution);
        return;
      }
      if (!result.ok || !result.image) {
        setMessage(result.error ?? "Не удалось получить QR-код.");
        return;
      }
      setQrImage(result.image);
      setWatching(true);
    } catch {
      if (id !== requestId.current) return;
      setQrPending(false);
      setWatching(false);
      setMessage("Не удалось получить QR-код.");
    }
  }

  showQrRef.current = showQr;

  useEffect(() => {
    if (activeTab !== "qr") return;
    void showQrRef.current();
  }, [activeTab]);

  function applyKeys() {
    const invalid = credentialsError();
    if (invalid) {
      setMessage(invalid);
      return;
    }
    onApply({ instanceId: instanceId.trim(), apiToken: apiToken.trim() });
    onClose();
  }

  async function showCode() {
    const invalid = credentialsError();
    if (invalid) {
      setMessage(invalid);
      return;
    }
    const digits = phoneNumber.replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(digits)) {
      setMessage("Введите номер в международном формате, например 79991234567.");
      return;
    }
    const id = ++requestId.current;
    setMessage(null);
    setLinkCode(null);
    setCodePending(true);
    const result = await requestWhatsAppLinkCode(instanceId, apiToken, digits, agentId);
    if (id !== requestId.current) return;
    setCodePending(false);
    if ("alreadyAuthorized" in result && result.alreadyAuthorized) {
      setAlreadyAuthorized(true);
      setWatching(evolution);
      return;
    }
    if (!result.ok || !result.code) {
      setMessage(result.error ?? "Не удалось получить код связывания.");
      return;
    }
    setPhoneNumber(digits);
    setLinkCode(result.code);
    setWatching(true);
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
        aria-labelledby="whatsapp-account-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">WhatsApp Business</p>
        <h2 id="whatsapp-account-title" className="mt-1 text-2xl font-semibold">
          Подключить номер
        </h2>
        <div className="mt-5 grid gap-4">
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              const next = value === "phone" ? "phone" : "qr";
              if (next === activeTab) return;
              resetFlow();
              setActiveTab(next);
            }}
          >
            <TabsList className="grid h-auto grid-cols-2">
              <TabsTrigger value="qr">QR-код</TabsTrigger>
              <TabsTrigger value="phone">Код на телефон</TabsTrigger>
            </TabsList>
            <TabsContent value="qr" className="grid gap-4">
              <div className="flex min-h-56 items-center justify-center">
                {qrPending ? (
                  <Loader2 className="size-8 animate-spin text-zinc-400" aria-label="Загрузка QR-кода" />
                ) : qrImage ? (
                  <img src={qrImage} alt="QR-код WhatsApp" className="h-56 w-56 rounded-xl bg-white" />
                ) : null}
              </div>
              {qrImage || (!qrPending && !alreadyAuthorized && message) ? (
                <button
                  type="button"
                  className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
                  disabled={qrPending}
                  onClick={() => void showQr()}
                >
                  Обновить QR
                </button>
              ) : null}
              <p className="text-sm leading-6 text-zinc-400">
                Откройте WhatsApp ➔ Связанные устройства ➔ Привязать устройство и сканируйте код
              </p>
            </TabsContent>
            <TabsContent value="phone" className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Номер телефона</span>
                <input
                  className={fieldClass}
                  value={phoneNumber}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="79991234567"
                  onChange={(event) => setPhoneNumber(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="rounded-xl bg-strike px-4 py-3 text-sm font-semibold text-white transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(207,2,52,0.45)] disabled:opacity-50"
                disabled={codePending}
                onClick={() => void showCode()}
              >
                {codePending ? "Загрузка" : "Получить код"}
              </button>
              {linkCode ? <p className="text-center text-3xl font-semibold tracking-[0.2em] text-white">{linkCode}</p> : null}
              <p className="text-sm leading-6 text-zinc-400">
                Введите этот код в WhatsApp в разделе Связанные устройства
              </p>
            </TabsContent>
          </Tabs>

          {watching ? <p className="text-sm text-zinc-400">Проверяем подключение…</p> : null}
          {alreadyAuthorized ? <p className="text-sm font-medium text-zinc-200">Уже авторизован</p> : null}
          {message ? <p className="text-sm text-red-300">{message}</p> : null}

          {evolution ? null : (
          <button
            type="button"
            className="text-left text-sm font-medium text-zinc-400 transition-colors hover:text-white"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            ⚙️ Настройки инстанса Green API
          </button>
          )}
          {!evolution && settingsOpen ? (
            <div className="grid gap-4">
              <label className="grid gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Instance ID</span>
                <input
                  className={fieldClass}
                  value={instanceId}
                  autoComplete="off"
                  inputMode="numeric"
                  onChange={(event) => {
                    setInstanceId(event.target.value);
                    setAlreadyAuthorized(false);
                  }}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">API Token</span>
                <input
                  className={fieldClass}
                  type="password"
                  value={apiToken}
                  autoComplete="off"
                  onChange={(event) => {
                    setApiToken(event.target.value);
                    setAlreadyAuthorized(false);
                  }}
                />
              </label>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
              onClick={onClose}
            >
              Закрыть
            </button>
            {evolution ? null : (
            <button
              type="button"
              className="rounded-xl bg-strike px-4 py-2.5 text-sm font-semibold text-white transition-shadow hover:shadow-[0_0_15px_rgba(207,2,52,0.45)]"
              onClick={applyKeys}
            >
              Применить ключи
            </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
