"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { cn } from "@/lib/utils";

type PlaygroundAgent = {
  id: string;
  name: string;
  model: string;
};

type TranscriptItem = {
  id: string;
  kind: "user" | "assistant" | "reset" | "error";
  content: string;
  context: number;
};

const STORAGE_KEY = "strike-playground-v1";

export function PlaygroundChat({
  agents,
  initialAgentId,
  loadError,
  embedded = false,
}: {
  agents: PlaygroundAgent[];
  initialAgentId: string | null;
  loadError: string | null;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [agentId, setAgentId] = useState(
    agents.some((agent) => agent.id === initialAgentId) ? (initialAgentId as string) : (agents[0]?.id ?? ""),
  );
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [context, setContext] = useState(1);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [ready, setReady] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as { items?: TranscriptItem[]; context?: number };
        if (Array.isArray(parsed.items)) {
          setItems(parsed.items.filter((item) => item.kind === "reset" || item.kind === "error" || normalizeChunk(item.content)));
        }
        if (typeof parsed.context === "number" && parsed.context > 0) setContext(parsed.context);
      } catch {
        window.sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ items, context }));
  }, [items, context, ready]);

  useEffect(() => {
    if (initialAgentId && agents.some((agent) => agent.id === initialAgentId)) {
      setAgentId(initialAgentId);
    }
  }, [agents, initialAgentId]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const transcript = transcriptRef.current;
      if (!transcript) return;
      transcript.scrollTop = transcript.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [items, typing]);

  function stopRequest() {
    abortRef.current?.abort();
    abortRef.current = null;
    setTyping(false);
  }

  function clearChat() {
    stopRequest();
    setItems([]);
    setContext(1);
  }

  function resetContext() {
    stopRequest();
    const next = context + 1;
    setContext(next);
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "reset", content: "", context: next },
    ]);
  }

  function selectAgent(id: string) {
    setAgentId(id);
    if (embedded) return;
    router.replace(id ? `/playground?agent=${id}` : "/playground", { scroll: false });
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !agentId || typing) return;

    const history = items
      .filter((item) => item.context === context && (item.kind === "user" || item.kind === "assistant"))
      .map((item) => ({ role: item.kind, content: item.content }));

    setDraft("");
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), kind: "user", content: text, context },
    ]);
    setTyping(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/playground", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, text, history }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Не удалось отправить сообщение.");
      }

      if (!response.body) {
        throw new Error("Пустой ответ сервера.");
      }

      let firstChunk = true;
      for await (const event of readEvents(response.body, controller.signal)) {
        if (event.type === "error") {
          throw new Error(typeof event.message === "string" ? event.message : "Ошибка модели.");
        }

        if (event.type === "chunk" && typeof event.content === "string") {
          const content = normalizeChunk(event.content);
          if (!content) continue;
          if (!firstChunk) {
            setTyping(true);
            await sleep(2000, controller.signal);
          }
          firstChunk = false;
          setTyping(false);
          setItems((prev) => [
            ...prev,
            { id: crypto.randomUUID(), kind: "assistant", content, context },
          ]);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Не удалось получить ответ.";
      setItems((prev) => [
        ...prev,
        { id: crypto.randomUUID(), kind: "error", content: message, context },
      ]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setTyping(false);
    }
  }

  return (
    <section
      className={cn(
        "mx-auto flex w-full max-w-4xl flex-col overflow-hidden bg-zinc-950",
        embedded
          ? "h-full rounded-none border-0"
          : "h-[min(42rem,calc(100dvh-18rem))] rounded-2xl border border-zinc-800/50",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-black/40 p-4">
        <label className="flex min-w-[220px] flex-1 items-center gap-3">
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Агент</span>
          <div className="min-w-0 flex-1">
            <SelectField
              value={agentId}
              disabled={agents.length === 0}
              options={
                agents.length === 0
                  ? [{ value: "", label: "Нет агентов" }]
                  : agents.map((agent) => ({ value: agent.id, label: `${agent.name} — ${agent.model}` }))
              }
              onChange={selectAgent}
            />
          </div>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={clearChat}>
            Очистить чат
          </Button>
          <Button type="button" variant="dark" size="sm" onClick={resetContext}>
            Сбросить контекст
          </Button>
        </div>
      </header>

      {loadError ? (
        <p className="border-b border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">{loadError}</p>
      ) : null}

      <div ref={transcriptRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-black/30 px-4 py-3">
        {agents.length === 0 ? (
          <p className="my-2 rounded-2xl border border-zinc-800 bg-black px-4 py-6 text-sm leading-6 text-zinc-400">
            Сначала создайте агента. Симулятор берёт системную инструкцию и модель из его карточки.
          </p>
        ) : null}
        {items.map((item) => {
          if (item.kind === "reset") {
            return (
              <p
                key={item.id}
                className="my-3 text-center text-[10px] font-semibold uppercase tracking-widest text-zinc-400"
              >
                Контекст сброшен
              </p>
            );
          }

          if (item.kind === "error") {
            return (
              <p key={item.id} className="my-2 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm leading-6 text-red-200">
                {item.content}
              </p>
            );
          }

          const content = normalizeChunk(item.content);
          if (!content) return null;

          const outgoing = item.kind === "assistant";
          return (
            <article
              key={item.id}
              className={cn(
                "my-2 max-w-[80%] rounded-2xl p-4",
                outgoing
                  ? "ml-auto rounded-br-xs bg-white text-black"
                  : "mr-auto rounded-bl-xs bg-zinc-800 text-zinc-100",
              )}
            >
              <span
                className={cn(
                  "mb-1 block text-[10px] uppercase tracking-widest",
                  outgoing ? "font-bold text-zinc-500" : "font-semibold text-zinc-400",
                )}
              >
                {outgoing ? "STRIKE AI" : "Вы (клиент)"}
              </span>
              <p className="whitespace-pre-wrap text-sm leading-6">{content}</p>
            </article>
          );
        })}
        {typing ? (
          <article className="my-2 ml-auto max-w-[80%] rounded-2xl rounded-br-xs bg-white p-4 text-black">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              STRIKE AI
            </span>
            <p className="text-sm leading-6 text-zinc-600">Печатает...</p>
          </article>
        ) : null}
      </div>

      <form
        className="flex items-center gap-3 border-t border-zinc-800 bg-black/40 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void sendMessage();
        }}
      >
        <input
          className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white"
          name="draft"
          value={draft}
          placeholder="Сообщение"
          onChange={(event) => setDraft(event.target.value)}
          disabled={!agentId || typing}
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black transition-shadow hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] active:scale-95 disabled:opacity-50"
          disabled={!agentId || typing || !draft.trim()}
        >
          Отправить
        </button>
      </form>
    </section>
  );
}

function normalizeChunk(content: string) {
  return content.replace(/\\n/g, "\n").trim();
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

async function* readEvents(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";

      for (const frame of frames) {
        const line = frame
          .split("\n")
          .filter((entry) => entry.startsWith("data:"))
          .map((entry) => entry.slice(5).trim())
          .join("");
        if (!line) continue;
        yield JSON.parse(line) as { type?: string; content?: string; message?: string };
      }

      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}
