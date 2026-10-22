"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Download, MessagesSquare, Trash } from "lucide-react";

import { deleteChat, setChatBotActive } from "@/app/chats/actions";
import { ChannelIcon } from "@/components/channel-icons";
import { generateChatHtml } from "@/lib/export-chat";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { ChatAgentOption, ChatMessage, ChatProvider, ChatThread } from "@/lib/chat-types";
import { channelLabel } from "@/lib/integration-catalog";
import { cn } from "@/lib/utils";

export function ChatInbox({
  agents,
  initialAgentId,
  initialThreads,
  initialMessages,
  initialSelectedId,
  loadError,
}: {
  agents: ChatAgentOption[];
  initialAgentId: string;
  initialThreads: ChatThread[];
  initialMessages: ChatMessage[];
  initialSelectedId: string | null;
  loadError: string | null;
}) {
  const [agentId, setAgentId] = useState(initialAgentId);
  const [threads, setThreads] = useState(initialThreads);
  const [messages, setMessages] = useState(initialMessages);
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [error, setError] = useState(loadError);
  const [botSaving, setBotSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [query, setQuery] = useState("");
  const removedRef = useRef(new Set<string>());
  /** Optimistic botActive overrides that polls must not clobber until the server catches up. */
  const botOverrideRef = useRef<Map<string, boolean>>(new Map());
  const toggleSeqRef = useRef(0);
  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;

  const selected = threads.find((thread) => thread.id === selectedId) ?? null;
  const visibleThreads = threads.filter((thread) => chatMatchesQuery(thread, query));

  useEffect(() => {
    if (initialSelectedId) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.get("chat")) return;
    url.searchParams.delete("chat");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [initialSelectedId]);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const payload = await fetchInbox(agentId, selectedId);
        if (cancelled) return;
        applyInbox(payload, selectedId);
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
  }, [agentId, selectedId]);

  function withBotOverrides(list: ChatThread[]) {
    const overrides = botOverrideRef.current;
    if (overrides.size === 0) return list;
    return list.map((thread) => {
      const override = overrides.get(thread.id);
      if (override === undefined) return thread;
      if (thread.botActive === override) {
        overrides.delete(thread.id);
        return thread;
      }
      return { ...thread, botActive: override };
    });
  }

  function applyInbox(payload: InboxPayload, conversationId: string | null) {
    const nextThreads = payload.conversations
      ? withBotOverrides(payload.conversations.filter((thread) => !removedRef.current.has(thread.id)))
      : null;
    if (nextThreads) setThreads(nextThreads);
    const visible = conversationId && nextThreads ? nextThreads.some((thread) => thread.id === conversationId) : Boolean(conversationId);
    if (conversationId && !visible) {
      setSelectedId(null);
      setMessages([]);
      writeChatUrl(agentIdRef.current, null);
      return;
    }
    if (conversationId && payload.messages) setMessages(payload.messages);
  }

  async function selectAgent(nextAgentId: string) {
    if (nextAgentId === agentId) return;
    const current = threads.find((thread) => thread.id === selectedId) ?? null;
    const keep = Boolean(current && (nextAgentId === "all" || current.agentId === nextAgentId));
    const nextSelected = keep ? selectedId : null;
    setAgentId(nextAgentId);
    if (!keep) {
      setSelectedId(null);
      setMessages([]);
    }
    writeChatUrl(nextAgentId, nextSelected);

    try {
      const payload = await fetchInbox(nextAgentId, nextSelected);
      const nextThreads = withBotOverrides(
        (payload.conversations ?? []).filter((thread) => !removedRef.current.has(thread.id)),
      );
      setThreads(nextThreads);
      if (nextSelected && nextThreads.some((thread) => thread.id === nextSelected)) {
        setMessages(payload.messages ?? []);
      } else if (nextSelected) {
        setSelectedId(null);
        setMessages([]);
        writeChatUrl(nextAgentId, null);
      }
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось загрузить диалоги.");
    }
  }

  async function openThread(id: string) {
    setSelectedId(id);
    writeChatUrl(agentId, id);

    try {
      const payload = await fetchInbox(agentId, id);
      applyInbox(payload, id);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Не удалось открыть диалог.");
    }
  }

  async function toggleBot(active: boolean) {
    if (!selected || deleting) return;
    const conversationId = selected.id;
    const previous = selected.botActive;
    if (previous === active) return;

    const seq = ++toggleSeqRef.current;
    botOverrideRef.current.set(conversationId, active);
    setThreads((current) =>
      current.map((thread) => (thread.id === conversationId ? { ...thread, botActive: active } : thread)),
    );
    setBotSaving(true);
    setError(null);

    try {
      const result = await setChatBotActive(conversationId, active);
      if (seq !== toggleSeqRef.current) return;
      if (!result.ok) {
        botOverrideRef.current.set(conversationId, previous);
        setThreads((current) =>
          current.map((thread) =>
            thread.id === conversationId ? { ...thread, botActive: previous } : thread,
          ),
        );
        setError(result.error);
      }
    } catch (failure) {
      if (seq !== toggleSeqRef.current) return;
      botOverrideRef.current.set(conversationId, previous);
      setThreads((current) =>
        current.map((thread) =>
          thread.id === conversationId ? { ...thread, botActive: previous } : thread,
        ),
      );
      setError(failure instanceof Error ? failure.message : "Не удалось переключить агента.");
    } finally {
      if (seq === toggleSeqRef.current) setBotSaving(false);
    }
  }

  function exportSelectedChat() {
    if (!selected) return;
    const agent = agents.find((item) => item.id === selected.agentId) ?? null;
    const html = generateChatHtml(selected, messages, agent);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `dialog_${selected.id}.html`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
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
    writeChatUrl(agentId, null);
  }

  return (
    <div>
      {error ? (
        <p className="mb-4 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">{error}</p>
      ) : null}

      <div className="grid overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900/50 backdrop-blur-md lg:h-[min(42rem,calc(100dvh-16rem))] lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <aside className="flex min-h-80 min-w-0 flex-col border-b border-zinc-800 lg:border-r lg:border-b-0">
          <AgentFilter agents={agents} value={agentId} onChange={(next) => void selectAgent(next)} />
          <div className="px-4 pt-3">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по номеру или имени..."
              aria-label="Поиск по номеру или имени"
            />
          </div>
          <p className="px-5 py-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Входящие</p>
          {threads.length === 0 ? (
            <p className="px-5 pb-6 text-sm leading-6 text-zinc-400">
              Диалогов пока нет. Они появятся, когда клиент напишет в подключённый канал.
            </p>
          ) : visibleThreads.length === 0 ? (
            <p className="px-5 pb-6 text-sm leading-6 text-zinc-400">Ничего не найдено.</p>
          ) : (
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {visibleThreads.map((thread) => {
                const active = thread.id === selected?.id;
                return (
                  <li key={thread.id}>
                    <button
                      type="button"
                      onClick={() => openThread(thread.id)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-3 text-left transition-colors",
                        active ? "bg-white/10" : "hover:bg-white/5",
                      )}
                    >
                      <ProviderMark provider={thread.provider} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="truncate font-heading text-sm font-semibold text-white">{thread.title}</span>
                          <span className="shrink-0 text-[10px] text-zinc-400">{formatStamp(thread.lastMessageAt)}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] text-zinc-400">{channelLabel(thread.provider)}</span>
                        <span className="mt-1 block truncate text-sm text-zinc-400">
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
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderMark provider={selected.provider} />
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold">{selected.title}</h2>
                    <p className="truncate text-xs text-zinc-400">
                      {channelLabel(selected.provider)}
                      {selected.provider === "widget" && selected.operatorName ? ` · Оператор: ${selected.operatorName}` : ""}
                      {selected.handle && selected.handle !== selected.title ? ` · ${selected.handle}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-3 text-sm text-zinc-300">
                    ИИ-агент активен
                    <Switch
                      checked={selected.botActive}
                      disabled={deleting}
                      onCheckedChange={(checked) => void toggleBot(checked)}
                      aria-busy={botSaving}
                      aria-label="ИИ-агент активен"
                      className={cn(botSaving && "opacity-70")}
                    />
                  </label>
                  <Button type="button" variant="outline" size="sm" onClick={exportSelectedChat} disabled={deleting}>
                    <Download className="size-4" strokeWidth={2} />
                    Экспорт
                  </Button>
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
                <p className="border-b border-zinc-800 bg-zinc-900 px-5 py-2 text-xs text-zinc-300">
                  Агент не отвечает в этом диалоге. Входящие сообщения сохраняются.
                </p>
              ) : null}
              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-black/40 px-5 py-5">
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
                            ? "ml-auto rounded-br-md bg-white text-black"
                            : "mr-auto rounded-bl-md bg-zinc-800 text-zinc-100",
                        )}
                      >
                        {selected.provider === "widget" ? (
                          <p className={cn("mb-1 text-[10px] font-semibold uppercase tracking-widest", outbound ? "text-zinc-500" : "text-zinc-400")}>
                            {outbound ? selected.operatorName || "Оператор" : selected.title}
                          </p>
                        ) : null}
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <p className={cn("mt-1 text-[10px]", outbound ? "text-zinc-500" : "text-zinc-400")}>
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
                <MessagesSquare className="mx-auto size-6 text-zinc-600" strokeWidth={1.75} />
                <p className="mt-3 text-sm text-zinc-400">Выберите диалог слева.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function AgentFilter({
  agents,
  value,
  onChange,
}: {
  agents: ChatAgentOption[];
  value: string;
  onChange: (agentId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = agents.find((agent) => agent.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(next: string) {
    setOpen(false);
    onChange(next);
  }

  return (
    <div className="border-b border-zinc-800 px-4 py-3">
      <span id="chat-agent-filter-label" className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        Агент
      </span>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center gap-2 rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-left text-sm text-white outline-none transition-colors hover:border-zinc-600 focus:border-white"
        >
          <span className="min-w-0 flex-1">
            {selected ? <AgentOptionLabel agent={selected} /> : <span className="font-medium">Все агенты</span>}
          </span>
          <ChevronDown className={cn("size-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
        </button>
        {open ? (
          <ul
            role="listbox"
            aria-labelledby="chat-agent-filter-label"
            className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 py-1"
          >
            <li>
              <FilterOption selected={value === "all"} onClick={() => choose("all")}>
                Все агенты
              </FilterOption>
            </li>
            {agents.map((agent) => (
              <li key={agent.id}>
                <FilterOption selected={value === agent.id} onClick={() => choose(agent.id)}>
                  <AgentOptionLabel agent={agent} />
                </FilterOption>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function FilterOption({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={cn(
        "flex w-full px-3 py-2.5 text-left text-sm text-zinc-200",
        selected ? "bg-white/10 font-medium text-white" : "hover:bg-white/5",
      )}
    >
      {children}
    </button>
  );
}

function AgentOptionLabel({ agent }: { agent: ChatAgentOption }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <span className="truncate font-medium">{agent.name}</span>
      {agent.channels.length > 0 ? (
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {agent.channels.map((channel) => (
            <span key={channel.provider} className="inline-flex max-w-28 items-center gap-1 text-[11px] text-zinc-400">
              <ChannelIcon provider={channel.provider} className="size-3.5 shrink-0" />
              {channel.label ? <span className="truncate">{channel.label}</span> : null}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

type InboxPayload = {
  conversations?: ChatThread[];
  messages?: ChatMessage[];
  error?: string;
};

async function fetchInbox(agentId: string, conversationId: string | null) {
  const params = new URLSearchParams({ agentId });
  if (conversationId) params.set("conversation", conversationId);
  const response = await fetch(`/api/chats?${params}`, { cache: "no-store" });
  const payload = (await response.json()) as InboxPayload;
  if (!response.ok) throw new Error(payload.error || "Не удалось загрузить чаты.");
  return payload;
}

function stripSearchMarks(value: string) {
  return value.replace(/[+\s()\-]/g, "");
}

function chatMatchesQuery(thread: ChatThread, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const needle = trimmed.toLowerCase();
  const name = thread.title.toLowerCase();
  if (name.includes(needle)) return true;

  const compactNeedle = stripSearchMarks(needle);
  if (!compactNeedle) return false;

  const compactName = stripSearchMarks(name);
  const compactPhone = stripSearchMarks(thread.handle).toLowerCase();
  return compactName.includes(compactNeedle) || compactPhone.includes(compactNeedle);
}

function writeChatUrl(agentId: string, conversationId: string | null) {
  const url = new URL(window.location.href);
  url.searchParams.set("agentId", agentId);
  if (conversationId) url.searchParams.set("chat", conversationId);
  else url.searchParams.delete("chat");
  window.history.replaceState(null, "", `${url.pathname}${url.search}`);
}

function ProviderMark({ provider }: { provider: ChatProvider }) {
  if (provider === "unknown") {
    return (
      <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-zinc-800 bg-black text-zinc-300">
        <MessagesSquare className="size-4" strokeWidth={2} />
      </span>
    );
  }

  return (
    <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-zinc-700 bg-zinc-900 text-white">
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
