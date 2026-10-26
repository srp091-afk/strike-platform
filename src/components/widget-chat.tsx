"use client";

import { MessageCircle, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { WidgetMarkdown } from "@/components/widget-markdown";
import type { WidgetPosition } from "@/lib/agent-models";
import type { WidgetConfig } from "@/lib/widget";

type WidgetMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

/** Длительность анимации окна; embed.js сжимает iframe только после неё. */
const PANEL_TRANSITION_MS = 300;

const PANEL_POSITION: Record<WidgetPosition, string> = {
  "bottom-right": "right-4 origin-bottom-right",
  "bottom-left": "left-4 origin-bottom-left",
  "bottom-center": "left-1/2 -translate-x-1/2 origin-bottom",
};

const LAUNCHER_POSITION: Record<WidgetPosition, string> = {
  "bottom-right": "right-[10px]",
  "bottom-left": "left-[10px]",
  "bottom-center": "left-1/2 -translate-x-1/2",
};

/** Сообщение родительскому окну (embed.js): он двигает и ресайзит iframe. */
function notifyHost(type: "ready" | "open" | "close", position: WidgetPosition) {
  if (window.parent === window) return;
  window.parent.postMessage({ source: "strike-widget", type, position }, "*");
}

/**
 * Плавающий веб-виджет: в свёрнутом виде — только круглый лаунчер, в
 * развёрнутом — окно чата. На стороннем сайте живёт в iframe, размер
 * которого embed.js меняет по событиям open/close из notifyHost.
 */
export function WidgetChat({ config }: { config: WidgetConfig }) {
  const position = config.widget_position;
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<WidgetMessage[]>([
    { id: "greeting", role: "assistant", content: config.widget_greeting },
  ]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const touchedRef = useRef(false);

  const open = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    notifyHost("open", position);
    setIsOpen(true);
  }, [position]);

  const close = useCallback(() => {
    touchedRef.current = true;
    setIsOpen(false);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      notifyHost("close", position);
    }, PANEL_TRANSITION_MS);
  }, [position]);

  useEffect(() => {
    notifyHost("ready", position);
  }, [position]);

  useEffect(() => {
    if (!config.widget_auto_open) return;
    const timer = window.setTimeout(() => {
      if (!touchedRef.current) open();
    }, config.widget_open_delay * 1000);
    return () => window.clearTimeout(timer);
  }, [config.widget_auto_open, config.widget_open_delay, open]);

  useEffect(() => {
    if (!isOpen) return;
    inputRef.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, close]);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages, pending]);

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;

    const userMessage: WidgetMessage = { id: crypto.randomUUID(), role: "user", content: text };
    // Приветствие уже лежит первым сообщением assistant — его нельзя выкидывать,
    // иначе модель считает диалог пустым и здоровается ещё раз.
    const transcript = [...messages, userMessage].map((message) => ({
      role: message.role,
      content: message.content,
    }));
    const visitorId = readVisitorId(config.agentId);
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setPending(true);

    try {
      const response = await fetch("/api/widget-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: config.agentId, visitor_id: visitorId, messages: transcript }),
      });
      const payload = (await response.json().catch(() => null)) as {
        reply?: string;
        replies?: string[];
        error?: string;
        visitor_id?: string;
      } | null;
      if (payload?.visitor_id) rememberVisitorId(config.agentId, payload.visitor_id);

      const parts =
        Array.isArray(payload?.replies) && payload.replies.length > 0
          ? payload.replies
          : [payload?.reply || payload?.error || "Не удалось ответить. Попробуйте позже."];
      for (const [index, content] of parts.entries()) {
        // Пауза «на печать» между частями одного ответа (2–4 с); индикатор набора остаётся включённым.
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, 2000 + Math.random() * 2000));
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", content }]);
      }
    } catch {
      setMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", content: "Не удалось ответить. Попробуйте позже." },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 text-zinc-100">
      <section
        aria-label="Окно чата"
        aria-hidden={!isOpen}
        className={`absolute bottom-4 flex h-[calc(100%-2rem)] max-h-[620px] w-[calc(100%-2rem)] max-w-[400px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-black/50 transition-[opacity,translate,scale,visibility] duration-300 ease-out ${PANEL_POSITION[position]} ${
          isOpen ? "pointer-events-auto visible translate-y-0 scale-100 opacity-100" : "invisible translate-y-4 scale-95 opacity-0"
        }`}
      >
        <header
          className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 border-b border-white/10 px-4 py-3 backdrop-blur-md"
          style={{ backgroundColor: `${config.widget_color_header_bg}cc`, color: config.widget_color_header_text }}
        >
          <WidgetAvatar url={config.widget_avatar_agent} name={config.widget_agent_name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{config.widget_agent_name}</p>
            <p className="flex items-center gap-1.5 text-[11px] opacity-70">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              онлайн
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Свернуть чат"
            className="grid size-8 shrink-0 place-items-center rounded-full opacity-70 transition-[opacity,background-color] hover:bg-white/10 hover:opacity-100"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </header>

        <div ref={transcriptRef} className="scrollbar-strike flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-20 pb-4">
          {messages.map((message) =>
            message.role === "assistant" ? (
              <div key={message.id} className="flex max-w-[88%] items-end gap-2 self-start">
                <WidgetAvatar url={config.widget_avatar_agent} name={config.widget_agent_name} small />
                <article className="rounded-2xl rounded-bl-md bg-[#262626] px-3.5 py-2.5">
                  <p className="mb-0.5 text-[10px] font-semibold tracking-wide opacity-60">{config.widget_agent_name}</p>
                  <WidgetMarkdown text={message.content} />
                </article>
              </div>
            ) : (
              <article
                key={message.id}
                className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-[#dd0005] px-3.5 py-2.5 text-white"
              >
                <p className="text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
              </article>
            ),
          )}
          {pending ? (
            <div className="flex items-end gap-2 self-start">
              <WidgetAvatar url={config.widget_avatar_agent} name={config.widget_agent_name} small />
              <p className="rounded-2xl rounded-bl-md bg-[#262626] px-3.5 py-2.5 text-sm text-zinc-400">Печатает…</p>
            </div>
          ) : null}
        </div>

        <form
          className="flex items-center gap-1 border-t border-white/10 px-3 pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <input
            ref={inputRef}
            className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-[#171717] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-zinc-500"
            value={draft}
            placeholder="Напишите сообщение"
            aria-label="Напишите сообщение"
            tabIndex={isOpen ? 0 : -1}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button
            type="submit"
            disabled={pending || !draft.trim()}
            aria-label="Отправить сообщение"
            tabIndex={isOpen ? 0 : -1}
            className="shrink-0 rounded-full p-2 text-white transition-colors hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Send className="size-5" strokeWidth={1.75} />
          </button>
        </form>

        <p className="px-3 pt-2 pb-3 text-center text-[10px] text-neutral-500">
          Разработано на платформе{" "}
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            tabIndex={isOpen ? 0 : -1}
            className="font-semibold text-neutral-400 transition-colors hover:text-[#dd0005]"
          >
            STRIKE
          </a>
        </p>
      </section>

      <button
        type="button"
        onClick={() => {
          touchedRef.current = true;
          open();
        }}
        aria-label="Открыть чат"
        aria-hidden={isOpen}
        tabIndex={isOpen ? -1 : 0}
        className={`absolute bottom-[10px] grid size-14 place-items-center rounded-full bg-white text-black shadow-lg shadow-black/40 transition-[opacity,scale] duration-300 ease-out hover:scale-105 ${LAUNCHER_POSITION[position]} ${
          isOpen ? "scale-75 opacity-0" : "pointer-events-auto scale-100 opacity-100"
        }`}
      >
        <span aria-hidden className="animate-widget-glow absolute inset-0 rounded-full" />
        <MessageCircle className="relative size-6" strokeWidth={2} />
      </button>
    </div>
  );
}

const VISITOR_KEY = "strike-widget-visitor";
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function visitorStorageKey(agentId: string) {
  return `${VISITOR_KEY}:${agentId}`;
}

/** Один гость — один диалог в кабинете, пока живёт localStorage браузера. */
function readVisitorId(agentId: string) {
  try {
    const stored = window.localStorage.getItem(visitorStorageKey(agentId));
    if (stored && VISITOR_ID.test(stored)) return stored;
    const created = crypto.randomUUID();
    window.localStorage.setItem(visitorStorageKey(agentId), created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

function rememberVisitorId(agentId: string, visitorId: string) {
  if (!VISITOR_ID.test(visitorId)) return;
  try {
    window.localStorage.setItem(visitorStorageKey(agentId), visitorId);
  } catch {
    // Приватный режим может запретить storage: следующий запрос получит новый id.
  }
}

function WidgetAvatar({ url, name, small = false }: { url: string | null; name: string; small?: boolean }) {
  const size = small ? "size-6 text-[9px]" : "size-9 text-xs";
  if (url) {
    return <img src={url} alt="" className={`${small ? "size-6" : "size-9"} shrink-0 rounded-full object-cover`} />;
  }
  const initials = name.trim().slice(0, 2).toUpperCase() || "AI";
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-full bg-[#dd0005] font-semibold text-white`}>
      {initials}
    </span>
  );
}
