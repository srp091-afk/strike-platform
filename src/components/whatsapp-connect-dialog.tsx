"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  confirmWhatsAppAuthorization,
  requestWhatsAppLinkCode,
  requestWhatsAppQr,
} from "@/app/integrations/actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type AgentOption = {
  id: string;
  name: string;
  isActive: boolean;
};

const fieldClass =
  "w-full rounded-xl border border-transparent bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 hover:bg-zinc-100/80 focus:border-zinc-300 focus:bg-white";

export function WhatsAppConnectDialog({ agents, onClose }: { agents: AgentOption[]; onClose: () => void }) {
  const router = useRouter();
  const activeAgents = agents.filter((agent) => agent.isActive);
  const [instanceId, setInstanceId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [agentId, setAgentId] = useState(activeAgents[0]?.id ?? "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [qrImage, setQrImage] = useState<string | null>(null);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [qrPending, setQrPending] = useState(false);
  const [codePending, setCodePending] = useState(false);
  const requestId = useRef(0);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
    setQrPending(false);
    setCodePending(false);
  }

  function credentialsError() {
    if (!/^\d{4,}$/.test(instanceId.trim())) return "Instance ID должен состоять из цифр.";
    if (apiToken.trim().length < 8) return "Укажите API Token.";
    if (!agentId) return "Выберите агента.";
    return null;
  }

  async function showQr() {
    const invalid = credentialsError();
    if (invalid) {
      setMessage(invalid);
      return;
    }
    const id = ++requestId.current;
    setMessage(null);
    setQrImage(null);
    setQrPending(true);
    const result = await requestWhatsAppQr(instanceId, apiToken);
    if (id !== requestId.current) return;
    setQrPending(false);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    setQrImage(result.image);
    setWatching(true);
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
    const result = await requestWhatsAppLinkCode(instanceId, apiToken, digits);
    if (id !== requestId.current) return;
    setCodePending(false);
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
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatsapp-account-title"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">WhatsApp Business</p>
        <h2 id="whatsapp-account-title" className="mt-1 text-2xl font-semibold">
          Подключить номер
        </h2>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Instance ID</span>
            <input
              className={fieldClass}
              value={instanceId}
              autoComplete="off"
              inputMode="numeric"
              onChange={(event) => setInstanceId(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">API Token</span>
            <input
              className={fieldClass}
              type="password"
              value={apiToken}
              autoComplete="off"
              onChange={(event) => setApiToken(event.target.value)}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Агент</span>
            <select
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition-all duration-200 focus:border-zinc-300"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
            >
              {activeAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </label>

          <Tabs
            defaultValue="qr"
            onValueChange={() => {
              resetFlow();
            }}
          >
            <TabsList className="grid h-auto grid-cols-1 gap-1 sm:grid-cols-2">
              <TabsTrigger value="qr" className="h-auto whitespace-normal px-2 py-2 text-xs leading-4">
                Авторизация по QR-коду
              </TabsTrigger>
              <TabsTrigger value="phone" className="h-auto whitespace-normal px-2 py-2 text-xs leading-4">
                Авторизация по номеру телефона
              </TabsTrigger>
            </TabsList>
            <TabsContent value="qr" className="grid gap-4">
              <button
                type="button"
                className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-zinc-800 disabled:opacity-50"
                disabled={qrPending || activeAgents.length === 0}
                onClick={() => void showQr()}
              >
                {qrPending ? "Загрузка" : "Показать QR-код"}
              </button>
              {qrImage ? (
                <img src={qrImage} alt="QR-код WhatsApp" className="mx-auto h-56 w-56 rounded-xl bg-white" />
              ) : null}
              <p className="text-sm leading-6 text-zinc-500">
                Откройте WhatsApp ➔ Настройки ➔ Связанные устройства ➔ Привязать устройство
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
                className="rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-zinc-800 disabled:opacity-50"
                disabled={codePending || activeAgents.length === 0}
                onClick={() => void showCode()}
              >
                {codePending ? "Загрузка" : "Получить код связывания"}
              </button>
              {linkCode ? <p className="text-center text-3xl font-semibold tracking-[0.2em] text-zinc-900">{linkCode}</p> : null}
              <p className="text-sm leading-6 text-zinc-500">
                Откройте WhatsApp на телефоне ➔ Связанные устройства ➔ Привязать устройство ➔ Привязать по номеру
                телефона и введите этот код
              </p>
            </TabsContent>
          </Tabs>

          {watching ? <p className="text-sm text-zinc-500">Проверяем подключение…</p> : null}
          {message ? <p className="text-sm text-red-600">{message}</p> : null}
          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-all duration-200 hover:bg-zinc-50"
              onClick={onClose}
            >
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
