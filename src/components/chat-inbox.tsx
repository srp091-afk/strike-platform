"use client";

import { useEffect, useRef, useState } from "react";
import { MessagesSquare, Trash } from "lucide-react";

import { deleteChat, setChatBotActive } from "@/app/chats/actions";
import { ChannelIcon } from "@/components/channel-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import type { ChatMessage, ChatProvider, ChatThread } from "@/lib/chat-types";
import type { IntegrationProvider } from "@/lib/integration-catalog";
import { cn } from "@/lib/utils";

const iconTone: Record<IntegrationProvider, string> = {
  telegram: "bg-sky-50 text-sky-600",
  whatsapp: "bg-emerald-50 text-emerald-600",
  instagram: "bg-rose-50 text-rose-600",
};

const providerLabel: Record<ChatProvider, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  instagram: "Instagram",
  unknown: "Канал",
};

export function ChatInbox({
  initialThreads,
  initialMessages,
  initialSelectedId,
  loadError,
}: {
  initialThreads: ChatThread[];
  initialMessages: ChatMessage[];
  initialSelectedId: string | null;
  loadError: string | null;
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [error, setError] = useState(loadError);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const removedRef = useRef(new Set<string>());

  const selected = threads.find((thread) => thread.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/chats?conversation=${selectedId}`, { cache: "no-store" });
        const payload = (await response.json()) as {
          conversations?: ChatThread[];
          messages?: ChatMessage[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error || "Не удалось обновить чат.");
        if (cancelled) return;
        if (payload.conversations) {
          setThreads(payload.conversations.filter((thread) => !removedRef.current.has(thread.id)));
        }
        if (payload.messages) setMessages(payload.messages);
        setError(null);
      } catch (failure) {
        if (!cancelled) {
          setError(failure instanceof Error ? failure.message : "Не удалось обновить чат.");
        }
      }
    }

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedId]);

  async function openThread(id: string) {
    setSelectedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("chat", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);

    try {
      const response = await fetch(`/api/chats?conversation=${id}`, { cache: "no-store" });
      const payload = (await response.json()) as {
        conversations?: ChatThread[];
        messages?: ChatMessage[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "Не удалось открыть диалог.");
      if (payload.conversations) {
        setThreads(payload.conversations.filter((thread) => !removedRef.current.has(thread.id)));
      }
      setMessages(payload.messages ?? []);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось открыть диалог.");
    }
  }

  async function toggleBot(active: boolean) {
    if (!selected) return;
    const previous = selected.botActive;
    setThreads((current) =>
      current.map((thread) => (thread.id === selected.id ? { ...thread, botActive: active } : thread)),
    );
    setPending(true);
    const result = await setChatBotActive(selected.id, active);
    setPending(false);
    if (!result.ok) {
      setThreads((current) =>
        current.map((thread) => (thread.id === selected.id ? { ...thread, botActive: previous } : thread)),
      );
      setError(result.error);
    }
  }

  async function removeSelected() {
    if (!selected || deleting) return;
    const id = selected.id;
    setDeleting(true);
    const result = await deleteChat(id);
    setDeleting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    removedRef.current.add(id);
    setThreads((current) => current.filter((thread) => thread.id !== id));
    setMessages([]);
    setSelectedId(null);
    setConfirmOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("chat");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="grid overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm lg:h-[min(42rem,calc(100dvh-16rem))] lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <aside className="flex min-h-80 min-w-0 flex-col border-b border-zinc-200/80 lg:border-r lg:border-b-0">
          <p className="px-5 py-4 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Входящие</p>
          {threads.length === 0 ? (
            <p className="px-5 pb-6 text-sm leading-6 text-zinc-500">
              Диалогов пока нет. Они появятся, когда клиент напишет в подключённый канал.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {threads.map((thread) => {
                const active = thread.id === selected?.id;
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => openThread(thread.id)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left transition-colors",
                        active ? "bg-zinc-50" : "hover:bg-zinc-50/70",
                      )}
                    >
                      <ProviderMark provider={thread.provider} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-heading text-sm font-semibold text-zinc-900">{thread.title}</span>
                          <span className="shrink-0 text-[10px] text-zinc-400">{formatStamp(thread.lastMessageAt)}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-zinc-400">{providerLabel[thread.provider]}</span>
                        <span className="mt-1 block truncate text-sm text-zinc-500">
                          {thread.preview || "Нет сообщений"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section className="flex min-h-[28rem] min-w-0 flex-col">
          {selected ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderMark provider={selected.provider} />
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{selected.title}</h2>
                    <p className="truncate text-xs text-zinc-500">
                      {providerLabel[selected.provider]}
                      {selected.handle && selected.handle !== selected.title ? ` · ${selected.handle}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-3 text-sm text-zinc-700">
                    ИИ-агент активен
                    <Switch
                      checked={selected.botActive}
                      disabled={pending || deleting}
                      onCheckedChange={(checked) => void toggleBot(checked)}
                      aria-label="ИИ-агент активен"
                    />
                  </label>
                  <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="ghost" className="text-red-500" aria-label="Удалить чат">
                        <Trash className="size-4" strokeWidth={2} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Удалить этот чат?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Вся история переписки будет стерта, и бот начнет общение с нуля при следующем сообщении. Это
                          действие нельзя отменить.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleting}>Отмена</AlertDialogCancel>
                        <AlertDialogAction disabled={deleting} onClick={(event) => {
                          event.preventDefault();
                          void removeSelected();
                        }}>
                          {deleting ? "Удаление" : "Удалить"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </header>
              {!selected.botActive ? (
                <p className="border-b border-zinc-200/80 bg-amber-50 px-5 py-2 text-xs text-amber-800">
                  Агент не отвечает в этом диалоге. Входящие сообщения сохраняются.
                </p>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-[#F8FAFC] px-5 py-5">
                {messages.length === 0 ? (
                  <p className="text-sm text-zinc-400">В этом диалоге пока нет сообщений.</p>
                ) : (
                  messages.map((message) => {
                    const outbound = message.role === "assistant";
                    return (
                      <article
                        key={message.id}
                        className={cn(
                          "max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
                          outbound
                            ? "ml-auto rounded-br-md bg-sky-100 text-sky-950"
                            : "mr-auto rounded-bl-md bg-zinc-100 text-zinc-900",
                        )}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <p className={cn("mt-1 text-[10px]", outbound ? "text-sky-700/70" : "text-zinc-400")}>
                          {formatStamp(message.createdAt)}
                        </p>
                      </article>
                    );
                  })
                )}
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center px-6 text-center">
              <div>
                <MessagesSquare className="mx-auto size-6 text-zinc-300" strokeWidth={1.75} />
                <p className="mt-3 text-sm text-zinc-500">Выберите диалог слева.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ProviderMark({ provider }: { provider: ChatProvider }) {
  if (provider === "unknown") {
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-500">
        <MessagesSquare className="size-4" strokeWidth={2} />
      </span>
    );
  }

  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", iconTone[provider])}>
      <ChannelIcon provider={provider} className="size-5" />
    </span>
  );
}

const MONTHS = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function formatStamp(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dubai = new Date(date.getTime() + 4 * 60 * 60 * 1000);
  const hours = String(dubai.getUTCHours()).padStart(2, "0");
  const minutes = String(dubai.getUTCMinutes()).padStart(2, "0");
  return `${dubai.getUTCDate()} ${MONTHS[dubai.getUTCMonth()]}, ${hours}:${minutes}`;
}
