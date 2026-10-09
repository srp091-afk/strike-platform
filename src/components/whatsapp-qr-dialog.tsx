"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function WhatsAppQrDialog({
  agentId,
  agentName,
  onClose,
}: {
  agentId: string;
  agentName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [image, setImage] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "qr" | "authorized" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    async function loadQr() {
      setStatus("loading");
      setError(null);
      try {
        const response = await fetch("/api/integrations/whatsapp/qr", { cache: "no-store" });
        const payload = (await response.json()) as { type?: string; image?: string; message?: string };
        if (cancelled) return;
        if (payload.type === "alreadyLogged") {
          setStatus("authorized");
          setImage(null);
          return;
        }
        if (payload.type === "qrCode" && payload.image) {
          setImage(payload.image);
          setStatus("qr");
          return;
        }
        setStatus("error");
        setError(payload.message || "Не удалось получить QR-код.");
      } catch {
        if (!cancelled) {
          setStatus("error");
          setError("Не удалось получить QR-код.");
        }
      }
    }

    void loadQr();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (status === "error" || status === "authorized") return;
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(`/api/integrations/whatsapp/state?agent=${encodeURIComponent(agentId)}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { state?: string };
        if (cancelled) return;
        if (payload.state === "authorized") {
          setStatus("authorized");
          setImage(null);
          router.refresh();
        }
      } catch {
        if (!cancelled) setError("Не удалось проверить статус подключения.");
      }
    }

    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [agentId, router, status]);

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
        aria-labelledby="whatsapp-qr-title"
        className="w-full max-w-md rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">WhatsApp</p>
        <h2 id="whatsapp-qr-title" className="mt-1 text-2xl font-semibold">
          QR-код
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Откройте WhatsApp на телефоне, перейдите в связанные устройства и отсканируйте код.
        </p>
        <p className="mt-4 text-sm text-zinc-700">
          Агент: <span className="font-medium text-zinc-900">{agentName || "не выбран"}</span>
        </p>

        <div className="mt-5 grid min-h-48 place-items-center">
          {status === "loading" ? <p className="text-sm text-zinc-400">Загрузка QR-кода</p> : null}
          {status === "qr" && image ? (
            <img
              src={image}
              alt="QR-код для подключения WhatsApp"
              className="h-64 w-64 rounded-xl border border-zinc-200 bg-white p-2"
            />
          ) : null}
          {status === "authorized" ? (
            <p className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-700">
              Подключено
            </p>
          ) : null}
          {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
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
  );
}
