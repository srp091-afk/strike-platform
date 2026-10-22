"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { WidgetConfig } from "@/lib/widget";

type WidgetMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

/**
 * Интерфейс публичного веб-виджета. Страница грузится в iframe на стороннем
 * сайте, поэтому компонент занимает весь вьюпорт и не тянет навигацию платформы.
 */
export function WidgetChat({ config }: { config: WidgetConfig }) {
  const [messages, setMessages] = useState<WidgetMessage[]>([
    { id: "greeting", role: "assistant", content: config.widget_greeting },
  ]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [messages, pending]);

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;

    const history = messages
      .filter((message) => message.id !== "greeting")
      .map((message) => ({ role: message.role, content: message.content }));
    const userMessage: WidgetMessage = { id: crypto.randomUUID(), role: "user", content: text };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setPending(true);

    try {
      const response = await fetch("/api/widget-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: config.agentId, text, history }),
      });
      const payload = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: payload?.reply || payload?.error || "Не удалось ответить. Попробуйте позже.",
        },
      ]);
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
    <div className="flex h-full flex-col overflow-hidden bg-[#0a0a0a] text-zinc-100">
      <header
        className="flex items-center gap-3 px-4 py-3"
        style={{ backgroundColor: config.widget_color_header_bg, color: config.widget_color_header_text }}
      >
        <WidgetAvatar url={config.widget_avatar_agent} name={config.widget_agent_name} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{config.widget_agent_name}</p>
          <p className="text-[11px] opacity-70">онлайн</p>
        </div>
      </header>

      <div ref={transcriptRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
        {messages.map((message) =>
          message.role === "assistant" ? (
            <div key={message.id} className="flex max-w-[88%] items-end gap-2 self-start">
              <WidgetAvatar url={config.widget_avatar_agent} name={config.widget_agent_name} small />
              <article className="rounded-2xl rounded-bl-md bg-[#262626] px-3.5 py-2.5">
                <p className="mb-0.5 text-[10px] font-semibold tracking-wide opacity-60">{config.widget_agent_name}</p>
                <p className="text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
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
        className="flex items-center gap-2 border-t border-zinc-800 px-3 pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-[#171717] px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-zinc-500"
          value={draft}
          placeholder="Напишите сообщение"
          aria-label="Напишите сообщение"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          aria-label="Отправить сообщение"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#dd0005] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send className="size-4" strokeWidth={2} />
        </button>
      </form>

      <p className="px-3 pt-2 pb-3 text-center text-[10px] text-neutral-500">
        Разработано на платформе{" "}
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-neutral-400 transition-colors hover:text-[#dd0005]"
        >
          STRIKE
        </a>
      </p>
    </div>
  );
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
