"use client";

import { Check, GripVertical, Globe, Loader2, Maximize, Play, Sparkles, Trash } from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { startTransition, Suspense, useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { mutate as swrMutate } from "swr";
import { AgentTemplatesDialog } from "@/components/agent-templates-dialog";
import { PlaygroundChat } from "@/components/playground-chat";
import { deleteAgent, reorderAgents, saveAgent, saveAgentDirect, type SaveState } from "@/app/agents/actions";
import { disconnectInstagram, disconnectTelegram, disconnectWhatsApp, saveWhatsAppPhone } from "@/app/agents/channels";
import { TelegramConnectModal } from "@/components/TelegramConnectModal";
import { WidgetConnectModal } from "@/components/WidgetConnectModal";
import { ChannelIcon } from "@/components/channel-icons";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { AgentKnowledge } from "@/components/agent-knowledge";
import { TwilioConnectCard } from "@/components/twilio-connect-card";
import { WhatsAppConnectDialog } from "@/components/whatsapp-connect-dialog";
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
import {
  AGENT_MODELS,
  DEFAULT_ACTIVE_CHANNELS,
  DEFAULT_AGENT_MODEL,
  HANDOFF_DURATIONS,
  effectiveActiveChannels,
  isTelegramConnected,
  normalizeAgentModel,
  readWidgetSettings,
  DEFAULT_CHANNEL_DELAYS,
  MAX_CHANNEL_DELAY_SECONDS,
  WIDGET_DELAY_CAP_SECONDS,
  sameChannelDelays,
  type ChannelDelays,
  telegramChannelLabel,
  type ActiveChannels,
  type AgentRecord,
  type HandoffDuration,
} from "@/lib/agent-models";
import { activeAccountHeader } from "@/lib/active-account";
import { CALENDAR_TIMEZONES } from "@/lib/calendar-timezones";
import type { IntegrationProvider } from "@/lib/integration-catalog";
import { PROMPT_VARIABLES } from "@/lib/utils/prompt-parser";

type GreenDefaults = {
  instanceId: string;
  apiToken: string;
};

const fieldClass =
  "w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none transition-colors duration-200 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-white";

const initialState: SaveState = {
  ok: false,
  error: null,
  savedId: null,
  attemptId: null,
  agentId: null,
  waPhoneNumber: null,
};

/** Поля подключения каналов и виджета: если они не изменились, перечитывать запись из списка не нужно. */
function sameChannelState(a: AgentRecord, b: AgentRecord) {
  return (
      a.waPhoneNumber === b.waPhoneNumber &&
      a.tgBotUsername === b.tgBotUsername &&
      a.waIsActive === b.waIsActive &&
      a.tgIsActive === b.tgIsActive &&
      a.igAccountId === b.igAccountId &&
      a.igUsername === b.igUsername &&
      a.igAvatarUrl === b.igAvatarUrl &&
      a.telegram_type === b.telegram_type &&
      a.telegram_bot_token === b.telegram_bot_token &&
      a.telegram_phone === b.telegram_phone &&
      a.telegram_api_id === b.telegram_api_id &&
      a.telegram_api_hash === b.telegram_api_hash &&
      a.telegram_session === b.telegram_session &&
      a.widget_position === b.widget_position &&
      a.widget_agent_name === b.widget_agent_name &&
      a.widget_operator_name === b.widget_operator_name &&
      a.widget_auto_open === b.widget_auto_open &&
      a.widget_open_delay === b.widget_open_delay &&
      a.widget_color_header_bg === b.widget_color_header_bg &&
      a.widget_color_header_text === b.widget_color_header_text &&
      a.widget_greeting === b.widget_greeting &&
      a.widget_avatar_agent === b.widget_avatar_agent &&
      a.widget_avatar_operator === b.widget_avatar_operator
  );
}

const CARD_CHANNELS: Array<{ provider: IntegrationProvider; label: string; activeClass: string }> = [
  { provider: "whatsapp", label: "WhatsApp", activeClass: "text-[#25D366]" },
  { provider: "telegram", label: "Telegram", activeClass: "text-[#229ED9]" },
  { provider: "instagram", label: "Instagram", activeClass: "text-[#E1306C]" },
  { provider: "widget", label: "Веб-виджет", activeClass: "text-strike" },
];

function SortableAgentCard({ agent, onTest, onEdit }: { agent: AgentRecord; onTest: () => void; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: agent.id,
  });

  const channelState = effectiveActiveChannels(agent);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md transition-colors duration-200 hover:border-zinc-600 ${
        isDragging ? "z-10 border-zinc-600 shadow-lg" : ""
      }`}
    >
      <div className="flex gap-3">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Перетащить агента ${agent.name}`}
          title="Перетащите, чтобы изменить порядок"
          className="-ml-2 mt-0.5 flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-5" strokeWidth={1.75} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <p className="font-heading text-xl font-semibold tracking-tight text-white">{agent.name}</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-widest text-zinc-400">{agent.model}</p>
            <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-400">{agent.system_prompt}</p>
          </div>
          <div className="flex flex-col sm:items-end">
            <div className="flex flex-wrap gap-2">
              <Button type="button" aria-label={`Тестировать агента ${agent.name}`} onClick={onTest}>
                <Play className="size-4" strokeWidth={2} />
                Тестировать
              </Button>
              <Button type="button" variant="outline" onClick={onEdit}>
                Править
              </Button>
              <form action={deleteAgent}>
                <input type="hidden" name="id" value={agent.id} />
                <Button
                  type="submit"
                  variant="dark"
                  onClick={(event) => {
                    if (!window.confirm(`Удалить агента ${agent.name}?`)) {
                      event.preventDefault();
                    }
                  }}
                >
                  Удалить
                </Button>
              </form>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 overflow-hidden" aria-label="Каналы агента">
              {CARD_CHANNELS.map(({ provider, label, activeClass }) => {
                const active = channelState[provider];
                return (
                  <span
                    key={provider}
                    title={`${label}: ${active ? "включён" : "выключен"}`}
                    className={`inline-flex ${active ? activeClass : "text-zinc-600 opacity-50"}`}
                  >
                    <ChannelIcon provider={provider} className="size-5" />
                    <span className="sr-only">{`${label}: ${active ? "включён" : "выключен"}`}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export function AgentManager({
  agents,
  greenDefaults,
  loadError,
  onSaved,
  initialEditingId,
  initialConnectChannel,
  agentAccess,
}: {
  agents: AgentRecord[];
  greenDefaults: GreenDefaults;
  loadError: string | null;
  onSaved?: () => void;
  /** Агент из URL /agents/<id>: открыть его правку после загрузки списка. */
  initialEditingId?: string;
  /** Канал из ?connect=: сразу открыть его модалку в правке initialEditingId. */
  initialConnectChannel?: "whatsapp" | "telegram" | "widget";
  agentAccess?: { isAdmin: boolean; maxAgents: number | null };
}) {
  const router = useRouter();
  const [editingBase, setEditing] = useState<AgentRecord | null>(null);
  // Свежая запись из списка (каналы подключаются в диалоге и обновляют агента) — считаем при рендере, без эффекта.
  const editing = useMemo(() => {
    if (!editingBase) return null;
    const fresh = agents.find((agent) => agent.id === editingBase.id);
    return !fresh || sameChannelState(fresh, editingBase) ? editingBase : fresh;
  }, [agents, editingBase]);
  const [testing, setTesting] = useState<AgentRecord | null>(null);
  const closeTesting = useCallback(() => setTesting(null), []);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState("closed");
  const [state, action, pending] = useActionState(saveAgent, initialState);

  useEffect(() => {
    if (!state.attemptId) return;
    const host = window as Window & {
      __strikeToasts?: Array<{ id: string; kind: "success" | "error"; message: string; expiresAt: number }>;
    };
    const item = {
      id: crypto.randomUUID(),
      kind: state.ok ? ("success" as const) : ("error" as const),
      message: state.ok ? "Настройки агента сохранены" : state.error || "Ошибка при сохранении",
      expiresAt: Date.now() + 4000,
    };
    host.__strikeToasts = [...(host.__strikeToasts ?? []), item];
    window.dispatchEvent(new CustomEvent("strike-toast"));
    window.setTimeout(() => {
      host.__strikeToasts = (host.__strikeToasts ?? []).filter((entry) => entry.id !== item.id);
      window.dispatchEvent(new CustomEvent("strike-toast"));
    }, 4000);
  }, [state.attemptId, state.ok, state.error]);

  useEffect(() => {
    if (!state.savedId) return;
    if (onSaved) onSaved();
    else {
      void swrMutate("/api/agents");
      router.refresh();
    }
  }, [state.savedId, router, onSaved]);


  const initialOpened = useRef(false);
  useEffect(() => {
    if (!initialEditingId || initialOpened.current) return;
    const agent = agents.find((item) => item.id === initialEditingId);
    if (!agent) return;
    initialOpened.current = true;
    openEdit(agent);
    // URL не чистим здесь: переход на /agents перемонтирует страницу и закроет диалог.
  }, [agents, initialEditingId]);

  const limitReached =
    agentAccess != null && !agentAccess.isAdmin && agentAccess.maxAgents != null && agents.length >= agentAccess.maxAgents;

  function openCreate() {
    if (limitReached) {
      router.push("/dashboard/billing");
      return;
    }
    setEditing(null);
    setSessionKey("new");
    setDialogOpen(true);
  }

  function openEdit(agent: AgentRecord) {
    setEditing(agent);
    setSessionKey(agent.id);
    setDialogOpen(true);
  }

  // Локальный порядок карточек: применяется сразу при перетаскивании, не дожидаясь ответа сервера.
  const [orderIds, setOrderIds] = useState<string[] | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const orderedAgents = useMemo(() => {
    if (!orderIds) return agents;
    const position = new Map(orderIds.map((id, index) => [id, index]));
    // Агенты вне локального порядка (только что созданные) остаются сверху.
    return [...agents].sort((a, b) => (position.get(a.id) ?? -1) - (position.get(b.id) ?? -1));
  }, [agents, orderIds]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedAgents.map((agent) => agent.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    const previous = orderIds;
    setOrderIds(next);
    setReorderError(null);
    try {
      const result = await reorderAgents(next);
      if (!result.ok) throw new Error(result.error ?? "Не удалось сохранить порядок.");
      if (onSaved) onSaved();
      else void swrMutate("/api/agents");
    } catch (error) {
      setOrderIds(previous);
      setReorderError(error instanceof Error ? error.message : "Не удалось сохранить порядок.");
    }
  }

  function closeDialog() {
    if (pending) return;
    setDialogOpen(false);
    setEditing(null);
    // Уход с глубокой ссылки /agents/<id> на список, чтобы ?connect= не переоткрывал модалки при перезагрузке.
    if (initialEditingId) {
      router.replace("/agents", { scroll: false });
    }
  }

  return (
    <div>
      {loadError ? (
        <p className="mb-6 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">{loadError}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Список агентов</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setTemplatesOpen(true)}>
            <Sparkles className="size-4" />
            Шаблоны
          </Button>
          <Button type="button" onClick={openCreate} disabled={limitReached}>
            + Создать агента
          </Button>
        </div>
      </div>
      {limitReached ? (
        <p className="mt-3 text-sm text-zinc-500">
          Вы достигли лимита агентов для вашего тарифа{" "}
          <Link href="/dashboard/billing" className="font-semibold text-strike">
            Перейти к тарифам
          </Link>
        </p>
      ) : null}

      {reorderError ? (
        <p className="mt-4 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">{reorderError}</p>
      ) : null}

      {agents.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900 shadow-sm px-6 py-10 text-sm text-zinc-400">
          Агентов пока нет. Создайте первого, чтобы подключить канал или открыть симулятор.
        </p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={orderedAgents.map((agent) => agent.id)} strategy={verticalListSortingStrategy}>
            <ul className="mt-6 grid gap-4">
              {orderedAgents.map((agent) => (
                <SortableAgentCard key={agent.id} agent={agent} onTest={() => setTesting(agent)} onEdit={() => openEdit(agent)} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      {dialogOpen ? (
        <AgentDialog
          key={sessionKey}
          editing={editing}
          agents={agents}
          initialConnectChannel={initialEditingId && editing?.id === initialEditingId ? initialConnectChannel : undefined}
          action={action}
          pending={pending}
          error={state.error}
          saved={
            state.ok && state.attemptId && state.agentId
              ? { attemptId: state.attemptId, agentId: state.agentId, waPhoneNumber: state.waPhoneNumber ?? "" }
              : null
          }
          greenDefaults={greenDefaults}
          onClose={closeDialog}
        />
      ) : null}
      {testing ? <SimulatorDialog agent={testing} agents={agents} onClose={closeTesting} /> : null}
      {templatesOpen ? (
        <AgentTemplatesDialog
          onClose={() => setTemplatesOpen(false)}
          onCreated={async (agentId) => {
            setTemplatesOpen(false);
            try {
              const accountId = activeAccountHeader();
              await swrMutate("/api/agents", async () => {
                const response = await fetch("/api/agents", {
                  cache: "no-store",
                  credentials: "same-origin",
                  headers: accountId ? { "x-account-id": accountId } : undefined,
                });
                const payload = (await response.json()) as { error?: string };
                if (!response.ok) throw new Error(payload.error || "Не удалось обновить список агентов.");
                return payload;
              });
            } catch {
              // Редактор всё равно откроется по ссылке, когда список догрузится.
            }
            router.replace(`/agents/${agentId}`, { scroll: false });
          }}
        />
      ) : null}
    </div>
  );
}

/** Задержка первого включённого канала агента (WhatsApp → Telegram → Instagram → веб-виджет); 0, если все выключены. */
function activeChannelDelay(agent: AgentRecord) {
  const active = effectiveActiveChannels(agent);
  if (active.whatsapp) return agent.channel_delays.whatsapp;
  if (active.telegram) return agent.channel_delays.telegram;
  if (active.instagram) return agent.channel_delays.instagram;
  if (active.widget) return agent.channel_delays.web_widget;
  return 0;
}

function SimulatorDialog({
  agent,
  agents,
  onClose,
}: {
  agent: AgentRecord;
  agents: AgentRecord[];
  onClose: () => void;
}) {
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

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4" onMouseDown={onClose}>
      <DialogContent
        aria-labelledby="simulator-dialog-title"
        className="flex h-[min(44rem,calc(100dvh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Симулятор</p>
            <h2 id="simulator-dialog-title" className="truncate font-sans text-lg font-bold text-white">
              {agent.name}
            </h2>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </header>
        <div className="min-h-0 flex-1">
          <PlaygroundChat
            key={agent.id}
            agents={agents.map((item) => ({ id: item.id, name: item.name, model: item.model, defaultDelay: activeChannelDelay(item) }))}
            initialAgentId={agent.id}
            loadError={null}
            embedded
          />
        </div>
      </DialogContent>
    </div>
  );
}

const AGENT_TABS = [
  { value: "main", label: "Основные" },
  { value: "prompt", label: "Инструкции" },
  { value: "knowledge", label: "База знаний" },
  { value: "channels", label: "Каналы связи" },
  { value: "behavior", label: "Поведение и автоматизации" },
] as const;

const tabCardClass = "grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm";

function GoogleCalendarCard({
  agentId,
  connected,
  timezone,
}: {
  agentId: string;
  connected: boolean;
  timezone: string;
}) {
  const [isConnected, setConnected] = useState(connected);
  const [zone, setZone] = useState(timezone);
  const [pending, setPending] = useState<"off" | "zone" | null>(null);
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    setConnected(connected);
    setZone(timezone);
  }, [connected, timezone, agentId]);

  useEffect(() => {
    const status = searchParams.get("calendar");
    if (status !== "connected" && status !== "error") return;
    if (status === "connected") toast.success("Google Calendar подключён");
    if (status === "error") toast.error(searchParams.get("message") || "Не удалось подключить Google Calendar.");
    const url = new URL(window.location.href);
    url.searchParams.delete("calendar");
    url.searchParams.delete("message");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", next);
  }, [searchParams]);

  async function disconnect() {
    setPending("off");
    try {
      const headers = new Headers();
      const accountId = activeAccountHeader();
      if (accountId) headers.set("x-account-id", accountId);
      const response = await fetch(`/api/agents/${agentId}/calendar`, { method: "DELETE", credentials: "same-origin", headers });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(data?.error || "Не удалось отключить календарь.");
        return;
      }
      setConnected(false);
      router.refresh();
      toast.success("Google Calendar отключён");
    } catch {
      toast.error("Не удалось отключить календарь.");
    } finally {
      setPending(null);
    }
  }

  async function changeZone(next: string) {
    const previous = zone;
    setZone(next);
    setPending("zone");
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountId = activeAccountHeader();
      if (accountId) headers.set("x-account-id", accountId);
      const response = await fetch(`/api/agents/${agentId}/calendar`, {
        method: "PATCH",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ timezone: next }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setZone(previous);
        toast.error(data?.error || "Не удалось сохранить таймзону.");
        return;
      }
      router.refresh();
    } catch {
      setZone(previous);
      toast.error("Не удалось сохранить таймзону.");
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md">
      <div className="grid gap-2">
        <h3 className="flex items-center gap-2 font-sans text-lg font-bold text-white">
          Google Calendar
          {isConnected ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
              <Check className="size-3" />
              Подключено
            </span>
          ) : null}
        </h3>
        <p className="text-sm leading-6 text-zinc-400">
          Агент проверяет свободные слоты и записывает клиента на встречу прямо в диалоге.
        </p>
      </div>
      {isConnected ? (
        <label className="grid max-w-xs gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Таймзона записи</span>
          <select
            className={fieldClass}
            value={zone}
            disabled={pending === "zone"}
            onChange={(event) => void changeZone(event.target.value)}
          >
            {CALENDAR_TIMEZONES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {!agentId ? (
        <p className="text-sm leading-6 text-zinc-400">Сначала сохраните агента.</p>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
          <span className="text-sm font-medium text-zinc-200">
            {isConnected ? "Календарь подключён" : "Подключить Google Calendar"}
          </span>
          {isConnected ? (
            <Button type="button" variant="outline" disabled={pending === "off"} onClick={() => void disconnect()}>
              {pending === "off" ? "Отключаем..." : "Отключить"}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => { window.location.href = `/api/agents/${agentId}/calendar/auth`; }}>
              Подключить
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function OutboundWebhookCard({
  agentId,
  url,
  secret,
  onChange,
}: {
  agentId: string;
  url: string;
  secret: string;
  onChange: (patch: { webhook_url?: string; webhook_secret?: string }) => void;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; status: number; error?: string } | null>(null);
  const canTest = url.trim().startsWith("http://") || url.trim().startsWith("https://");

  function generateSecret() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    onChange({ webhook_secret: Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("") });
  }

  async function sendTest() {
    if (!agentId) {
      toast.error("Сначала сохраните агента.");
      return;
    }
    setPending(true);
    setResult(null);
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountId = activeAccountHeader();
      if (accountId) headers.set("x-account-id", accountId);
      const response = await fetch(`/api/agents/${agentId}/webhook/test`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ webhook_url: url.trim(), webhook_secret: secret.trim() }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; status?: number; error?: string } | null;
      setResult({
        ok: Boolean(data?.ok) && response.ok,
        status: typeof data?.status === "number" ? data.status : response.status,
        error: data?.error,
      });
    } catch (error) {
      setResult({ ok: false, status: 0, error: error instanceof Error ? error.message : "Сеть недоступна" });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md">
      <div className="grid gap-2">
        <h3 className="font-sans text-lg font-bold text-white">Исходящий Webhook (CRM / Make / n8n)</h3>
        <p className="text-sm leading-6 text-zinc-400">STRIKE будет отправлять POST-запрос с каждым сообщением диалога и сменой статуса агента.</p>
      </div>
      <label className="grid gap-2 text-sm text-zinc-300">
        Webhook URL
        <input
          name="webhook_url"
          value={url}
          onChange={(event) => onChange({ webhook_url: event.target.value })}
          placeholder="https://hook.eu2.make.com/..."
          autoComplete="off"
          spellCheck={false}
          className={fieldClass}
        />
      </label>
      <div className="grid gap-2">
        <span className="text-sm text-zinc-300">Секретный ключ</span>
        <div className="flex items-center gap-2">
          <input
            name="webhook_secret"
            value={secret}
            onChange={(event) => onChange({ webhook_secret: event.target.value })}
            placeholder="Необязательно, для заголовка X-Strike-Signature"
            autoComplete="off"
            spellCheck={false}
            className={fieldClass}
          />
          <button type="button" onClick={generateSecret} className="shrink-0 rounded-xl border border-zinc-800 bg-black px-3 py-3 text-xs text-white transition-colors hover:border-zinc-700">
            Сгенерировать
          </button>
        </div>
        <p className="text-xs leading-5 text-zinc-500">Если ключ задан, STRIKE подписывает тело запроса HMAC-SHA256 и кладёт подпись в заголовок X-Strike-Signature.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!canTest || pending} onClick={() => void sendTest()}>
          {pending ? "Отправляем..." : "Отправить тест"}
        </Button>
        {result?.ok ? (
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
            {result.status} OK — Доставлено
          </span>
        ) : result ? (
          <span className="inline-flex items-center rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-medium text-red-400">
            {result.status ? `${result.status} — ` : ""}
            {result.error || "Ошибка"}
          </span>
        ) : null}
      </div>
      {!agentId ? <p className="text-sm leading-6 text-zinc-400">Сначала сохраните агента, чтобы отправить тест.</p> : null}
    </section>
  );
}

function AmoCrmCard({
  agentId,
  connected,
  domain,
  token,
  pipelineId,
  statusId,
  onChange,
}: {
  agentId: string;
  connected: boolean;
  domain: string;
  token: string;
  pipelineId: string;
  statusId: string;
  onChange: (patch: { amo_domain?: string; amo_access_token?: string; amo_pipeline_id?: string; amo_handoff_status_id?: string }) => void;
}) {
  const router = useRouter();
  const [isConnected, setConnected] = useState(connected);
  const [tokenOpen, setTokenOpen] = useState(!connected);
  const [pending, setPending] = useState<"test" | "off" | null>(null);
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState("");
  const [pipelines, setPipelines] = useState<{ id: string; name: string; statuses: { id: string; name: string }[] }[]>([]);

  useEffect(() => {
    setConnected(connected);
    setTokenOpen(!connected);
  }, [connected, agentId]);

  const pipeline = pipelines.find((item) => item.id === pipelineId);
  const statuses = pipeline?.statuses ?? [];
  const webhookUrl = agentId ? `https://www.strikeplatform.io/api/webhooks/amocrm/${agentId}` : "";

  async function accountHeaders() {
    const headers = new Headers({ "Content-Type": "application/json" });
    const accountId = activeAccountHeader();
    if (accountId) headers.set("x-account-id", accountId);
    return headers;
  }

  async function checkConnection() {
    if (!agentId) {
      toast.error("Сначала сохраните агента.");
      return;
    }
    setPending("test");
    setError("");
    try {
      const response = await fetch(`/api/agents/${agentId}/amocrm/test`, {
        method: "POST",
        credentials: "same-origin",
        headers: await accountHeaders(),
        body: JSON.stringify({ amo_domain: domain.trim(), amo_access_token: token.trim() }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        accountName?: string;
        pipelines?: { id: string; name: string; statuses: { id: string; name: string }[] }[];
      } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Не удалось подключиться к amoCRM.");
        return;
      }
      setAccountName(data.accountName || "");
      setPipelines(data.pipelines ?? []);
      toast.success(data.accountName ? `Аккаунт: ${data.accountName}` : "amoCRM отвечает.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Сеть недоступна");
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    if (!agentId) return;
    setPending("off");
    try {
      const headers = await accountHeaders();
      headers.delete("Content-Type");
      const response = await fetch(`/api/agents/${agentId}/amocrm`, { method: "DELETE", credentials: "same-origin", headers });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(data?.error || "Не удалось отключить amoCRM.");
        return;
      }
      setConnected(false);
      setTokenOpen(true);
      onChange({ amo_access_token: "" });
      toast.success("amoCRM отключён");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function copyWebhook() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку.");
    }
  }

  function choosePipeline(value: string) {
    const next = pipelines.find((item) => item.id === value);
    const keepStatus = next?.statuses.some((status) => status.id === statusId) ?? false;
    onChange({ amo_pipeline_id: value, amo_handoff_status_id: keepStatus ? statusId : "" });
  }

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md">
      <div className="grid gap-2">
        <h3 className="flex items-center gap-2 font-sans text-lg font-bold text-white">
          amoCRM / Kommo
          {isConnected ? (
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
              Подключено
            </span>
          ) : null}
        </h3>
        <p className="text-sm leading-6 text-zinc-400">
          При первом сообщении STRIKE создаёт контакт и сделку, а переписку пишет в карточку. Когда менеджер забирает сделку, бот замолкает.
        </p>
      </div>
      <label className="grid gap-2 text-sm text-zinc-300">
        Домен аккаунта
        <input
          name="amo_domain"
          value={domain}
          onChange={(event) => onChange({ amo_domain: event.target.value })}
          placeholder="mycompany.amocrm.ru или mycompany.kommo.com"
          autoComplete="off"
          spellCheck={false}
          className={fieldClass}
        />
      </label>
      {tokenOpen ? (
        <label className="grid gap-2 text-sm text-zinc-300">
          Долгосрочный токен (Long-lived token)
          <input
            name="amo_access_token"
            type="password"
            value={token}
            onChange={(event) => onChange({ amo_access_token: event.target.value })}
            placeholder={isConnected ? "Новый токен" : "Токен из amoCRM / Kommo"}
            autoComplete="new-password"
            spellCheck={false}
            className={fieldClass}
          />
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!domain.trim() || pending !== null || (!token.trim() && !isConnected)} onClick={() => void checkConnection()}>
          {pending === "test" ? "Проверяем..." : "Проверить и загрузить воронки"}
        </Button>
        {isConnected ? (
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => setTokenOpen((current) => !current)}>
              Обновить токен
            </Button>
            <Button type="button" variant="outline" disabled={pending === "off"} onClick={() => void disconnect()}>
              {pending === "off" ? "Отключаем..." : "Отключить"}
            </Button>
          </>
        ) : null}
      </div>
      {accountName ? <p className="text-sm text-emerald-400">Аккаунт: {accountName}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {pipelines.length > 0 || pipelineId || statusId ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-zinc-300">
            Воронка для новых сделок
            <select name="amo_pipeline_id" value={pipelineId} onChange={(event) => choosePipeline(event.target.value)} className={fieldClass}>
              <option value="">Основная воронка</option>
              {(pipelines.length > 0 ? pipelines : pipelineId ? [{ id: pipelineId, name: `Воронка ${pipelineId}`, statuses: [] }] : []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-zinc-300">
            Этап для перевода на оператора (Handoff)
            <select
              name="amo_handoff_status_id"
              value={statusId}
              onChange={(event) => onChange({ amo_handoff_status_id: event.target.value })}
              className={fieldClass}
              disabled={Boolean(pipelineId) && pipelines.length > 0 && statuses.length === 0}
            >
              <option value="">Не переводить</option>
              {(statuses.length > 0 ? statuses : statusId ? [{ id: statusId, name: `Этап ${statusId}` }] : []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="amo_pipeline_id" value={pipelineId} />
          <input type="hidden" name="amo_handoff_status_id" value={statusId} />
        </>
      )}
      <div className="grid gap-2">
        <span className="text-sm text-zinc-300">Webhook URL для amoCRM</span>
        <div className="flex items-center gap-2">
          <input readOnly value={webhookUrl} placeholder="Сначала сохраните агента" className={fieldClass} />
          <button type="button" onClick={() => void copyWebhook()} disabled={!webhookUrl} className="shrink-0 rounded-xl border border-zinc-800 bg-black px-3 py-3 text-xs text-white transition-colors hover:border-zinc-700 disabled:opacity-40">
            Скопировать
          </button>
        </div>
        <p className="text-xs leading-5 text-zinc-500">Добавьте этот URL в Настройки → Интеграции → Webhooks в amoCRM, чтобы бот автоматически замолкал при перехвате сделки менеджером.</p>
      </div>
      {!agentId ? <p className="text-sm leading-6 text-zinc-400">Сначала сохраните агента, чтобы проверить подключение.</p> : null}
    </section>
  );
}

function PipedriveCard({
  agentId,
  connected,
  token,
  pipelineId,
  stageId,
  onChange,
}: {
  agentId: string;
  connected: boolean;
  token: string;
  pipelineId: string;
  stageId: string;
  onChange: (patch: { pipedrive_api_token?: string; pipedrive_pipeline_id?: string; pipedrive_handoff_stage_id?: string }) => void;
}) {
  const router = useRouter();
  const [isConnected, setConnected] = useState(connected);
  const [tokenOpen, setTokenOpen] = useState(!connected);
  const [pending, setPending] = useState<"test" | "off" | null>(null);
  const [accountName, setAccountName] = useState("");
  const [error, setError] = useState("");
  const [pipelines, setPipelines] = useState<{ id: string; name: string; stages: { id: string; name: string }[] }[]>([]);

  useEffect(() => {
    setConnected(connected);
    setTokenOpen(!connected);
  }, [connected, agentId]);

  const pipeline = pipelines.find((item) => item.id === pipelineId);
  const stages = pipeline?.stages ?? (pipelineId ? [] : pipelines.flatMap((item) => item.stages));
  const webhookUrl = agentId ? `https://www.strikeplatform.io/api/webhooks/pipedrive/${agentId}` : "";

  async function accountHeaders() {
    const headers = new Headers({ "Content-Type": "application/json" });
    const accountId = activeAccountHeader();
    if (accountId) headers.set("x-account-id", accountId);
    return headers;
  }

  async function checkConnection() {
    if (!agentId) {
      toast.error("Сначала сохраните агента.");
      return;
    }
    setPending("test");
    setError("");
    try {
      const response = await fetch(`/api/agents/${agentId}/pipedrive/test`, {
        method: "POST",
        credentials: "same-origin",
        headers: await accountHeaders(),
        body: JSON.stringify({ pipedrive_api_token: token.trim() }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        accountName?: string;
        pipelines?: { id: string; name: string; stages: { id: string; name: string }[] }[];
      } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Не удалось подключиться к Pipedrive.");
        return;
      }
      setAccountName(data.accountName || "");
      setPipelines(data.pipelines ?? []);
      toast.success(data.accountName ? `Аккаунт: ${data.accountName}` : "Pipedrive отвечает.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Сеть недоступна");
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    if (!agentId) return;
    setPending("off");
    try {
      const headers = await accountHeaders();
      headers.delete("Content-Type");
      const response = await fetch(`/api/agents/${agentId}/pipedrive`, { method: "DELETE", credentials: "same-origin", headers });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(data?.error || "Не удалось отключить Pipedrive.");
        return;
      }
      setConnected(false);
      setTokenOpen(true);
      onChange({ pipedrive_api_token: "" });
      toast.success("Pipedrive отключён");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function copyWebhook() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку.");
    }
  }

  function choosePipeline(value: string) {
    const next = pipelines.find((item) => item.id === value);
    const keepStage = next?.stages.some((stage) => stage.id === stageId) ?? !value;
    onChange({ pipedrive_pipeline_id: value, pipedrive_handoff_stage_id: keepStage ? stageId : "" });
  }

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md">
      <div className="grid gap-2">
        <h3 className="flex items-center gap-2 font-sans text-lg font-bold text-white">
          Pipedrive CRM
          {isConnected ? (
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
              Подключено
            </span>
          ) : null}
        </h3>
        <p className="text-sm leading-6 text-zinc-400">
          При первом сообщении STRIKE создаёт контакт и сделку, а переписку пишет в заметки. Когда менеджер забирает сделку, бот замолкает.
        </p>
      </div>
      {tokenOpen ? (
        <label className="grid gap-2 text-sm text-zinc-300">
          API Token
          <input
            name="pipedrive_api_token"
            type="password"
            value={token}
            onChange={(event) => onChange({ pipedrive_api_token: event.target.value })}
            placeholder={isConnected ? "Новый токен" : "API-токен Pipedrive"}
            autoComplete="new-password"
            spellCheck={false}
            className={fieldClass}
          />
          <span className="text-xs leading-5 text-zinc-500">Найти в Pipedrive: Профиль → Личные настройки → API</span>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={pending !== null || (!token.trim() && !isConnected)} onClick={() => void checkConnection()}>
          {pending === "test" ? "Проверяем..." : "Проверить и загрузить воронки"}
        </Button>
        {isConnected ? (
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => setTokenOpen((current) => !current)}>
              Обновить токен
            </Button>
            <Button type="button" variant="outline" disabled={pending === "off"} onClick={() => void disconnect()}>
              {pending === "off" ? "Отключаем..." : "Отключить"}
            </Button>
          </>
        ) : null}
      </div>
      {accountName ? <p className="text-sm text-emerald-400">Аккаунт: {accountName}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {pipelines.length > 0 || pipelineId || stageId ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-zinc-300">
            Воронка для новых сделок
            <select name="pipedrive_pipeline_id" value={pipelineId} onChange={(event) => choosePipeline(event.target.value)} className={fieldClass}>
              <option value="">Основная воронка</option>
              {(pipelines.length > 0 ? pipelines : pipelineId ? [{ id: pipelineId, name: `Воронка ${pipelineId}`, stages: [] }] : []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-zinc-300">
            Этап для перевода на оператора (Handoff)
            <select
              name="pipedrive_handoff_stage_id"
              value={stageId}
              onChange={(event) => onChange({ pipedrive_handoff_stage_id: event.target.value })}
              className={fieldClass}
              disabled={Boolean(pipelineId) && pipelines.length > 0 && stages.length === 0}
            >
              <option value="">Не переводить</option>
              {(stages.length > 0 ? stages : stageId ? [{ id: stageId, name: `Этап ${stageId}` }] : []).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="pipedrive_pipeline_id" value={pipelineId} />
          <input type="hidden" name="pipedrive_handoff_stage_id" value={stageId} />
        </>
      )}
      <div className="grid gap-2">
        <span className="text-sm text-zinc-300">Webhook URL для Pipedrive</span>
        <div className="flex items-center gap-2">
          <input readOnly value={webhookUrl} placeholder="Сначала сохраните агента" className={fieldClass} />
          <button type="button" onClick={() => void copyWebhook()} disabled={!webhookUrl} className="shrink-0 rounded-xl border border-zinc-800 bg-black px-3 py-3 text-xs text-white transition-colors hover:border-zinc-700 disabled:opacity-40">
            Скопировать
          </button>
        </div>
        <p className="text-xs leading-5 text-zinc-500">Добавьте этот URL в Pipedrive (Инструменты и приложения → Вебхуки) на события updated.deal и added.note, чтобы бот замолкал при перехвате сделки менеджером.</p>
      </div>
      {!agentId ? <p className="text-sm leading-6 text-zinc-400">Сначала сохраните агента, чтобы проверить подключение.</p> : null}
    </section>
  );
}

function BitrixCard({
  agentId,
  connected,
  webhook,
  openLineId,
  responsibleId,
  statusId,
  onChange,
}: {
  agentId: string;
  connected: boolean;
  webhook: string;
  openLineId: string;
  responsibleId: string;
  statusId: string;
  onChange: (patch: { bitrix_webhook_url?: string; bitrix_openline_id?: string; bitrix_responsible_id?: string; bitrix_handoff_status_id?: string }) => void;
}) {
  const router = useRouter();
  const [isConnected, setConnected] = useState(connected);
  const [webhookOpen, setWebhookOpen] = useState(!connected);
  const [pending, setPending] = useState<"test" | "off" | null>(null);
  const [portalName, setPortalName] = useState("");
  const [error, setError] = useState("");
  const [openLines, setOpenLines] = useState<{ id: string; name: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [statuses, setStatuses] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    setConnected(connected);
    setWebhookOpen(!connected);
  }, [connected, agentId]);

  const webhookUrl = agentId ? `https://www.strikeplatform.io/api/webhooks/bitrix24/${agentId}` : "";
  const showLists = openLines.length > 0 || users.length > 0 || statuses.length > 0 || Boolean(openLineId || responsibleId || statusId);

  async function accountHeaders() {
    const headers = new Headers({ "Content-Type": "application/json" });
    const accountId = activeAccountHeader();
    if (accountId) headers.set("x-account-id", accountId);
    return headers;
  }

  async function checkConnection() {
    if (!agentId) {
      toast.error("Сначала сохраните агента.");
      return;
    }
    setPending("test");
    setError("");
    try {
      const response = await fetch(`/api/agents/${agentId}/bitrix24/test`, {
        method: "POST",
        credentials: "same-origin",
        headers: await accountHeaders(),
        body: JSON.stringify({ bitrix_webhook_url: webhook.trim() }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        portalName?: string;
        openLines?: { id: string; name: string }[];
        users?: { id: string; name: string }[];
        statuses?: { id: string; name: string }[];
      } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Не удалось подключиться к Битрикс24.");
        return;
      }
      setPortalName(data.portalName || "");
      setOpenLines(data.openLines ?? []);
      setUsers(data.users ?? []);
      setStatuses(data.statuses ?? []);
      toast.success(data.portalName ? `Портал: ${data.portalName}` : "Битрикс24 отвечает.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Сеть недоступна");
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    if (!agentId) return;
    setPending("off");
    try {
      const headers = await accountHeaders();
      headers.delete("Content-Type");
      const response = await fetch(`/api/agents/${agentId}/bitrix24`, { method: "DELETE", credentials: "same-origin", headers });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(data?.error || "Не удалось отключить Битрикс24.");
        return;
      }
      setConnected(false);
      setWebhookOpen(true);
      onChange({ bitrix_webhook_url: "" });
      toast.success("Битрикс24 отключён");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function copyWebhook() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку.");
    }
  }

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md">
      <div className="grid gap-2">
        <h3 className="flex items-center gap-2 font-sans text-lg font-bold text-white">
          Битрикс24 (Открытые Линии + CRM)
          {isConnected ? (
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
              Подключено
            </span>
          ) : null}
        </h3>
        <p className="text-sm leading-6 text-zinc-400">
          При первом сообщении STRIKE создаёт лид и пишет переписку в таймлайн. Горячий лид переводится на выбранного сотрудника, и бот замолкает.
        </p>
      </div>
      {webhookOpen ? (
        <label className="grid gap-2 text-sm text-zinc-300">
          Входящий вебхук Битрикс24
          <input
            name="bitrix_webhook_url"
            type="password"
            value={webhook}
            onChange={(event) => onChange({ bitrix_webhook_url: event.target.value })}
            placeholder="https://company.bitrix24.ru/rest/1/xxxxxxxx/"
            autoComplete="new-password"
            spellCheck={false}
            className={fieldClass}
          />
          <span className="text-xs leading-5 text-zinc-500">Разработчикам → Другое → Входящий вебхук (права: crm, im, imopenlines, imconnector, user)</span>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={pending !== null || (!webhook.trim() && !isConnected)} onClick={() => void checkConnection()}>
          {pending === "test" ? "Проверяем..." : "Проверить и загрузить настройки"}
        </Button>
        {isConnected ? (
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => setWebhookOpen((current) => !current)}>
              Обновить
            </Button>
            <Button type="button" variant="outline" disabled={pending === "off"} onClick={() => void disconnect()}>
              {pending === "off" ? "Отключаем..." : "Отключить"}
            </Button>
          </>
        ) : null}
      </div>
      {portalName ? <p className="text-sm text-emerald-400">Портал: {portalName}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {showLists ? (
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm text-zinc-300">
            Открытая Линия
            <select name="bitrix_openline_id" value={openLineId} onChange={(event) => onChange({ bitrix_openline_id: event.target.value })} className={fieldClass}>
              <option value="">Не выбрана</option>
              {withCurrent(openLines, openLineId, `Линия ${openLineId}`).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-zinc-300">
            Ответственный сотрудник (для перевода горячих лидов)
            <select name="bitrix_responsible_id" value={responsibleId} onChange={(event) => onChange({ bitrix_responsible_id: event.target.value })} className={fieldClass}>
              <option value="">Не назначать</option>
              {withCurrent(users, responsibleId, `Сотрудник ${responsibleId}`).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm text-zinc-300">
            Стадия лида при переводе на оператора
            <select name="bitrix_handoff_status_id" value={statusId} onChange={(event) => onChange({ bitrix_handoff_status_id: event.target.value })} className={fieldClass}>
              <option value="">Не переводить</option>
              {withCurrent(statuses, statusId, statusId).map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="bitrix_openline_id" value={openLineId} />
          <input type="hidden" name="bitrix_responsible_id" value={responsibleId} />
          <input type="hidden" name="bitrix_handoff_status_id" value={statusId} />
        </>
      )}
      <div className="grid gap-2">
        <span className="text-sm text-zinc-300">Webhook URL для Битрикс24</span>
        <div className="flex items-center gap-2">
          <input readOnly value={webhookUrl} placeholder="Сначала сохраните агента" className={fieldClass} />
          <button type="button" onClick={() => void copyWebhook()} disabled={!webhookUrl} className="shrink-0 rounded-xl border border-zinc-800 bg-black px-3 py-3 text-xs text-white transition-colors hover:border-zinc-700 disabled:opacity-40">
            Скопировать
          </button>
        </div>
        <p className="text-xs leading-5 text-zinc-500">Добавьте этот URL в Исходящий вебхук Битрикс24 на события ONIMCONNECTORMESSAGEADD и ONCRMLEADUPDATE, чтобы бот замолкал при перехвате диалога оператором.</p>
      </div>
      {!agentId ? <p className="text-sm leading-6 text-zinc-400">Сначала сохраните агента, чтобы проверить подключение.</p> : null}
    </section>
  );
}

function withCurrent(items: { id: string; name: string }[], id: string, label: string) {
  if (!id || items.some((item) => item.id === id)) return items;
  return [...items, { id, name: label }];
}

function AgentDialog({
  editing,
  agents,
  initialConnectChannel,
  action,
  pending,
  error,
  saved,
  greenDefaults,
  onClose,
}: {
  editing: AgentRecord | null;
  agents: AgentRecord[];
  initialConnectChannel?: "whatsapp" | "telegram" | "widget";
  action: (payload: FormData) => void;
  pending: boolean;
  error: string | null;
  saved: { attemptId: string; agentId: string; waPhoneNumber: string } | null;
  greenDefaults: GreenDefaults;
  onClose: () => void;
}) {
  const router = useRouter();
  const [initialDraft] = useState(() => draftFromAgent(editing));
  const [draft, setDraft] = useState(initialDraft);
  const [baseline, setBaseline] = useState(initialDraft);
  const [persistedId, setPersistedId] = useState(editing?.id ?? "");
  const [connectError, setConnectError] = useState<string | null>(null);
  const ensuringSave = useRef<Promise<string | null> | null>(null);
  const dirty = !sameDraft(draft, baseline);
  // После автосейва нового агента его запись подтягивается из списка по persistedId.
  const channelAgent = editing ?? agents.find((agent) => agent.id === persistedId) ?? null;
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const ignoredSave = useRef(saved?.attemptId ?? null);
  const appliedSave = useRef<string | null>(null);

  useEffect(() => {
    if (!saved || saved.attemptId === ignoredSave.current || appliedSave.current === saved.attemptId) return;
    appliedSave.current = saved.attemptId;
    const next = {
      ...draftRef.current,
      wa_phone_number: saved.waPhoneNumber || draftRef.current.wa_phone_number,
    };
    setDraft(next);
    setBaseline(next);
    setPersistedId(saved.agentId);
  }, [saved]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector("[data-channel-dialog]")) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function patchDraft(patch: Partial<AgentDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  /** FormData из текущего черновика — зеркало полей формы для программного сейва. */
  function formDataFromDraft(current: AgentDraft) {
    const data = new FormData();
    if (persistedId) data.set("id", persistedId);
    data.set("name", current.name);
    data.set("model", current.model);
    data.set("temperature", current.temperature);
    data.set("system_prompt", current.system_prompt);
    data.set(
      "active_channels",
      JSON.stringify({
        ...current.active_channels,
        whatsapp: Boolean(current.wa_instance_id || current.wa_phone_number || editing?.waIsActive) && current.active_channels.whatsapp,
      }),
    );
    data.set("channel_delays", JSON.stringify(current.channel_delays));
    data.set("human_handoff_duration", current.human_handoff_duration);
    data.set("telegram_chat_id", current.telegram_chat_id);
    data.set("notify_email_enabled", current.notify_email_enabled ? "true" : "false");
    data.set("notify_email_address", current.notify_email_address);
    data.set("limit_agent_messages", current.limit_agent_messages);
    data.set("limit_client_messages", current.limit_client_messages);
    data.set("limit_total_messages", current.limit_total_messages);
    data.set("split_messages", current.split_messages ? "true" : "false");
    data.set("followup_enabled", current.followup_enabled ? "true" : "false");
    data.set("followup_interval_hours", current.followup_interval_hours);
    data.set("followup_max_count", current.followup_max_count);
    data.set("followup_template", current.followup_template);
    data.set("wa_instance_id", current.wa_instance_id);
    data.set("wa_api_token", current.wa_api_token);
    data.set("wa_phone_number", current.wa_phone_number);
    data.set("webhook_url", current.webhook_url);
    data.set("webhook_secret", current.webhook_secret);
    data.set("amo_domain", current.amo_domain);
    data.set("amo_pipeline_id", current.amo_pipeline_id);
    data.set("amo_handoff_status_id", current.amo_handoff_status_id);
    if (current.amo_access_token) data.set("amo_access_token", current.amo_access_token);
    data.set("pipedrive_pipeline_id", current.pipedrive_pipeline_id);
    data.set("pipedrive_handoff_stage_id", current.pipedrive_handoff_stage_id);
    if (current.pipedrive_api_token) data.set("pipedrive_api_token", current.pipedrive_api_token);
    data.set("bitrix_openline_id", current.bitrix_openline_id);
    data.set("bitrix_responsible_id", current.bitrix_responsible_id);
    data.set("bitrix_handoff_status_id", current.bitrix_handoff_status_id);
    if (current.bitrix_webhook_url) data.set("bitrix_webhook_url", current.bitrix_webhook_url);
    return data;
  }

  /** Создать запись агента в БД, если его ещё нет. Возвращает реальный agentId. */
  async function ensureAgentSaved(): Promise<string | null> {
    if (persistedId) return persistedId;
    if (ensuringSave.current) return ensuringSave.current;
    const run = (async () => {
      setConnectError(null);
      const result = await saveAgentDirect(formDataFromDraft(draftRef.current));
      if (!result.ok || !result.agentId) {
        setConnectError(result.error ?? "Не удалось сохранить агента.");
        return null;
      }
      setPersistedId(result.agentId);
      setBaseline(draftRef.current);
      void swrMutate("/api/agents");
      return result.agentId;
    })();
    ensuringSave.current = run;
    try {
      return await run;
    } finally {
      ensuringSave.current = null;
    }
  }

  /**
   * Клик «Подключить» канала: новый агент сначала автосохраняется, URL уходит
   * на /agents/<id>?connect=<channel> (форма — режим редактирования), и только
   * потом открывается модалка. Существующий агент — сразу модалка.
   */
  async function handleChannelConnect(channel: "whatsapp" | "telegram" | "widget"): Promise<boolean> {
    const wasNew = !persistedId;
    const agentId = await ensureAgentSaved();
    if (!agentId) return false;
    if (wasNew) {
      router.replace(`/agents/${agentId}?connect=${channel}`, { scroll: false });
    }
    return true;
  }

  /** «Подключить Instagram»: новый агент сначала автосохраняется, затем переходим на OAuth Meta. */
  async function handleInstagramConnect(): Promise<boolean> {
    const agentId = await ensureAgentSaved();
    if (!agentId) return false;
    // Это API-роут (полная навигация на OAuth), а не страница Next.js.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/api/auth/instagram/connect?agentId=${encodeURIComponent(agentId)}`);
    return true;
  }

  return (
    <div className="fixed inset-0 z-[60]">
      <DialogContent aria-labelledby="agent-dialog-title" className="flex flex-col overflow-hidden">
        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!dirty || pending) return;
            if (!draft.name.trim()) {
              toast.error("Укажи имя агента.");
              return;
            }
            const data = new FormData(event.currentTarget);
            startTransition(() => {
              action(data);
            });
          }}
        >
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 bg-black px-6 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Агент</p>
              <h2 id="agent-dialog-title" className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-2xl font-semibold">{persistedId ? "Правка агента" : "Новый агент"}</span>
                {draft.name.trim() ? (
                  <span className="max-w-full truncate rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm font-medium text-zinc-100">
                    {draft.name.trim()}
                  </span>
                ) : persistedId ? (
                  <span className="rounded-full border border-zinc-800 px-3 py-1 text-sm font-medium text-zinc-500">
                    Без названия
                  </span>
                ) : null}
              </h2>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={!dirty || pending}
                className="disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? "Сохранение" : "Сохранить"}
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-4xl p-4 sm:p-6">
              {persistedId ? <input type="hidden" name="id" value={persistedId} /> : null}
              {/* Неактивные вкладки остаются в DOM (forceMount + hidden): иначе их поля не попали бы в FormData при сохранении. */}
              <Tabs defaultValue="main" className="gap-0">
                <TabsList className="mb-6 h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {AGENT_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="h-10 flex-none rounded-xl px-4 text-sm data-[state=inactive]:hover:bg-zinc-950 data-[state=inactive]:hover:text-white"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <TabsContent value="main" forceMount className="data-[state=inactive]:hidden">
                  <section className={tabCardClass}>
                    <label className="grid gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Имя</span>
                      <input
                        className={fieldClass}
                        name="name"
                        required
                        value={draft.name}
                        placeholder="Квалификатор"
                        onChange={(event) => patchDraft({ name: event.target.value })}
                      />
                    </label>

                    <label className="grid min-w-0 gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Модель</span>
                      <SelectField
                        name="model"
                        value={draft.model}
                        options={AGENT_MODELS.map((model) => ({
                          value: model.value,
                          label: `${model.value} (${model.label})`,
                        }))}
                        onChange={(model) => patchDraft({ model })}
                      />
                    </label>

                    <CreativityField
                      value={draft.temperature}
                      onChange={(temperature) => patchDraft({ temperature })}
                    />
                  </section>
                </TabsContent>

                <TabsContent value="prompt" forceMount className="data-[state=inactive]:hidden">
                  <section className={tabCardClass}>
                    <SystemPromptField
                      value={draft.system_prompt}
                      onChange={(system_prompt) => patchDraft({ system_prompt })}
                    />
                  </section>
                </TabsContent>

                <TabsContent value="knowledge" forceMount className="data-[state=inactive]:hidden">
                  <section className={tabCardClass}>
                    <AgentKnowledge agentId={persistedId} />
                  </section>
                </TabsContent>

                <TabsContent value="channels" forceMount className="data-[state=inactive]:hidden">
                  <ChannelSettings
                    agent={channelAgent}
                    agentId={persistedId}
                    initialOpenChannel={initialConnectChannel}
                    connectError={connectError}
                    onConnectChannel={handleChannelConnect}
                    onConnectInstagram={handleInstagramConnect}
                    credentials={{ instanceId: draft.wa_instance_id, apiToken: draft.wa_api_token }}
                    phone={draft.wa_phone_number}
                    greenDefaults={greenDefaults}
                    channels={draft.active_channels}
                    onChannelsChange={(active_channels) => patchDraft({ active_channels })}
                    delays={draft.channel_delays}
                    onDelaysChange={(channel_delays) => patchDraft({ channel_delays })}
                    onWhatsAppCredentials={(credentials) =>
                      patchDraft({
                        wa_instance_id: credentials.instanceId,
                        wa_api_token: credentials.apiToken,
                      })
                    }
                    onWhatsAppPhone={(wa_phone_number) => {
                      setDraft((current) => ({ ...current, wa_phone_number }));
                      setBaseline((current) => ({ ...current, wa_phone_number }));
                    }}
                    onWhatsAppCleared={() => {
                      const cleared = { wa_instance_id: "", wa_api_token: "", wa_phone_number: "" };
                      setDraft((current) => ({ ...current, ...cleared }));
                      setBaseline((current) => ({ ...current, ...cleared }));
                    }}
                  />
                </TabsContent>

                <TabsContent value="behavior" forceMount className="data-[state=inactive]:hidden">
                  <div className="grid content-start gap-6">
                    <HumanHandoffField
                      value={draft.human_handoff_duration}
                      onChange={(human_handoff_duration) => patchDraft({ human_handoff_duration })}
                    />
                    <LeadNotificationsField
                      value={draft.telegram_chat_id}
                      onChange={(telegram_chat_id) => patchDraft({ telegram_chat_id })}
                      emailEnabled={draft.notify_email_enabled}
                      emailAddress={draft.notify_email_address}
                      onEmailEnabled={(notify_email_enabled) => patchDraft({ notify_email_enabled })}
                      onEmailAddress={(notify_email_address) => patchDraft({ notify_email_address })}
                    />
                    <MessageLimitsField
                      agentLimit={draft.limit_agent_messages}
                      clientLimit={draft.limit_client_messages}
                      totalLimit={draft.limit_total_messages}
                      onChange={patchDraft}
                    />
                    <SplitMessagesField
                      enabled={draft.split_messages}
                      onChange={(split_messages) => patchDraft({ split_messages })}
                    />
                    <FollowupField
                      enabled={draft.followup_enabled}
                      intervalHours={draft.followup_interval_hours}
                      maxCount={draft.followup_max_count}
                      template={draft.followup_template}
                      onChange={patchDraft}
                    />
                    <GoogleCalendarCard
                      agentId={persistedId}
                      connected={channelAgent?.gcalConnected ?? false}
                      timezone={channelAgent?.gcalTimezone ?? "UTC"}
                    />
                    <OutboundWebhookCard
                      agentId={persistedId}
                      url={draft.webhook_url}
                      secret={draft.webhook_secret}
                      onChange={patchDraft}
                    />
                    <AmoCrmCard
                      agentId={persistedId}
                      connected={channelAgent?.amoConnected ?? false}
                      domain={draft.amo_domain}
                      token={draft.amo_access_token}
                      pipelineId={draft.amo_pipeline_id}
                      statusId={draft.amo_handoff_status_id}
                      onChange={patchDraft}
                    />
                    <PipedriveCard
                      agentId={persistedId}
                      connected={channelAgent?.pipedriveConnected ?? false}
                      token={draft.pipedrive_api_token}
                      pipelineId={draft.pipedrive_pipeline_id}
                      stageId={draft.pipedrive_handoff_stage_id}
                      onChange={patchDraft}
                    />
                    <BitrixCard
                      agentId={persistedId}
                      connected={channelAgent?.bitrixConnected ?? false}
                      webhook={draft.bitrix_webhook_url}
                      openLineId={draft.bitrix_openline_id}
                      responsibleId={draft.bitrix_responsible_id}
                      statusId={draft.bitrix_handoff_status_id}
                      onChange={patchDraft}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
            </div>
          </div>        </form>
      </DialogContent>
    </div>
  );
}

type AgentDraft = {
  name: string;
  model: string;
  temperature: string;
  system_prompt: string;
  active_channels: ActiveChannels;
  channel_delays: ChannelDelays;
  human_handoff_duration: HandoffDuration;
  telegram_chat_id: string;
  notify_email_enabled: boolean;
  notify_email_address: string;
  limit_agent_messages: string;
  limit_client_messages: string;
  limit_total_messages: string;
  split_messages: boolean;
  followup_enabled: boolean;
  followup_interval_hours: string;
  followup_max_count: string;
  followup_template: string;
  wa_instance_id: string;
  wa_api_token: string;
  wa_phone_number: string;
  webhook_url: string;
  webhook_secret: string;
  amo_domain: string;
  amo_access_token: string;
  amo_pipeline_id: string;
  amo_handoff_status_id: string;
  pipedrive_api_token: string;
  pipedrive_pipeline_id: string;
  pipedrive_handoff_stage_id: string;
  bitrix_webhook_url: string;
  bitrix_openline_id: string;
  bitrix_responsible_id: string;
  bitrix_handoff_status_id: string;
};

function draftFromAgent(agent: AgentRecord | null): AgentDraft {
  return {
    name: agent?.name ?? "",
    model: normalizeAgentModel(agent?.model ?? DEFAULT_AGENT_MODEL),
    temperature: String(agent?.temperature ?? 0.7),
    system_prompt: agent?.system_prompt ?? "",
    active_channels: { ...(agent?.active_channels ?? DEFAULT_ACTIVE_CHANNELS) },
    channel_delays: { ...(agent?.channel_delays ?? DEFAULT_CHANNEL_DELAYS) },
    human_handoff_duration: agent?.human_handoff_duration ?? "1_hour",
    telegram_chat_id: agent?.telegram_chat_id ?? "",
    notify_email_enabled: agent?.notify_email_enabled ?? false,
    notify_email_address: agent?.notify_email_address ?? "",
    limit_agent_messages: String(agent?.limit_agent_messages ?? 0),
    limit_client_messages: String(agent?.limit_client_messages ?? 0),
    limit_total_messages: String(agent?.limit_total_messages ?? 0),
    split_messages: agent?.split_messages ?? false,
    followup_enabled: agent?.followup_enabled ?? false,
    followup_interval_hours: String(agent?.followup_interval_hours ?? 24),
    followup_max_count: String(agent?.followup_max_count ?? 2),
    followup_template: agent?.followup_template ?? "",
    wa_instance_id: agent?.waInstanceId ?? "",
    wa_api_token: agent?.waApiToken ?? "",
    wa_phone_number: agent?.waPhoneNumber ?? "",
    webhook_url: agent?.webhook_url ?? "",
    webhook_secret: agent?.webhook_secret ?? "",
    amo_domain: agent?.amo_domain ?? "",
    amo_access_token: "",
    amo_pipeline_id: agent?.amo_pipeline_id ?? "",
    amo_handoff_status_id: agent?.amo_handoff_status_id ?? "",
    pipedrive_api_token: "",
    pipedrive_pipeline_id: agent?.pipedrive_pipeline_id ?? "",
    pipedrive_handoff_stage_id: agent?.pipedrive_handoff_stage_id ?? "",
    bitrix_webhook_url: "",
    bitrix_openline_id: agent?.bitrix_openline_id ?? "",
    bitrix_responsible_id: agent?.bitrix_responsible_id ?? "",
    bitrix_handoff_status_id: agent?.bitrix_handoff_status_id ?? "",
  };
}

function sameDraft(left: AgentDraft, right: AgentDraft) {
  return (
    left.name === right.name &&
    left.model === right.model &&
    left.system_prompt === right.system_prompt &&
    left.human_handoff_duration === right.human_handoff_duration &&
    left.telegram_chat_id.trim() === right.telegram_chat_id.trim() &&
    left.notify_email_enabled === right.notify_email_enabled &&
    left.notify_email_address.trim().toLowerCase() === right.notify_email_address.trim().toLowerCase() &&
    left.split_messages === right.split_messages &&
    left.followup_enabled === right.followup_enabled &&
    left.followup_template.trim() === right.followup_template.trim() &&
    sameNumber(left.followup_interval_hours, right.followup_interval_hours) &&
    sameNumber(left.followup_max_count, right.followup_max_count) &&
    sameNumber(left.temperature, right.temperature) &&
    sameChannelDelays(left.channel_delays, right.channel_delays) &&
    sameNumber(left.limit_agent_messages, right.limit_agent_messages) &&
    sameNumber(left.limit_client_messages, right.limit_client_messages) &&
    sameNumber(left.limit_total_messages, right.limit_total_messages) &&
    left.active_channels.whatsapp === right.active_channels.whatsapp &&
    left.active_channels.telegram === right.active_channels.telegram &&
    left.active_channels.instagram === right.active_channels.instagram &&
    left.active_channels.widget === right.active_channels.widget &&
    left.wa_instance_id === right.wa_instance_id &&
    left.wa_api_token === right.wa_api_token &&
    left.wa_phone_number === right.wa_phone_number &&
    left.webhook_url.trim() === right.webhook_url.trim() &&
    left.webhook_secret === right.webhook_secret &&
    left.amo_domain.trim().toLowerCase() === right.amo_domain.trim().toLowerCase() &&
    left.amo_access_token === right.amo_access_token &&
    left.amo_pipeline_id === right.amo_pipeline_id &&
    left.amo_handoff_status_id === right.amo_handoff_status_id &&
    left.pipedrive_api_token === right.pipedrive_api_token &&
    left.pipedrive_pipeline_id === right.pipedrive_pipeline_id &&
    left.pipedrive_handoff_stage_id === right.pipedrive_handoff_stage_id &&
    left.bitrix_webhook_url === right.bitrix_webhook_url &&
    left.bitrix_openline_id === right.bitrix_openline_id &&
    left.bitrix_responsible_id === right.bitrix_responsible_id &&
    left.bitrix_handoff_status_id === right.bitrix_handoff_status_id
  );
}

function sameNumber(left: string, right: string) {
  if (!left.trim() || !right.trim()) return left.trim() === right.trim();
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber === rightNumber;
  return left === right;
}

const promptPlaceholder = "#ROLE\nТы оператор STRIKE. Отвечай коротко, по делу, без воды.";

function SystemPromptField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="grid gap-4">
      <WebToKnowledge value={value} onChange={onChange} />
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            Системная инструкция <span className="text-white">#ROLE</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Развернуть системную инструкцию"
            onClick={() => setOpen(true)}
          >
            <Maximize className="size-4" />
          </Button>
        </div>
        <textarea
          ref={areaRef}
          className={`${fieldClass} min-h-80 resize-y`}
          name="system_prompt"
          value={value}
          placeholder={promptPlaceholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <PromptVariables onInsert={(token) => insertPromptToken(areaRef.current, value, token, onChange)} />
        {open ? <SystemPromptDialog value={value} onChange={onChange} onClose={() => setOpen(false)} /> : null}
      </div>
    </div>
  );
}

function WebToKnowledge({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [url, setUrl] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  async function generate() {
    const site = url.trim();
    if (!/^https?:\/\/.+\..+/i.test(site) && !/^[^\s]+\.[^\s]+$/.test(site)) {
      toast.error("Введите корректный адрес сайта.");
      return;
    }
    setIsParsing(true);
    try {
      const response = await fetch("/api/agents/parse-website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ url: site }),
      });
      const data = (await response.json().catch(() => null)) as { prompt?: string; error?: string } | null;
      const prompt = data?.prompt?.trim() ?? "";
      if (!response.ok || !prompt) {
        toast.error(data?.error || "Не удалось разобрать сайт.");
        return;
      }
      const current = value.trim();
      onChange(current ? `${current}\n\n${prompt}` : prompt);
      toast.success(current ? "Инструкция добавлена к текущему тексту" : "Инструкция составлена по сайту");
    } catch {
      toast.error("Не удалось разобрать сайт.");
    } finally {
      setIsParsing(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-black p-4">
      <p className="text-sm font-medium text-white">Автогенерация из сайта (Web-to-Knowledge)</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          inputMode="url"
          value={url}
          disabled={isParsing}
          placeholder="https://example.com"
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (!isParsing) void generate();
            }
          }}
          className={fieldClass}
        />
        <Button type="button" disabled={isParsing} onClick={() => void generate()} className="shrink-0">
          {isParsing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {isParsing ? "Анализируем сайт..." : "Сгенерировать инструкцию"}
        </Button>
      </div>
    </div>
  );
}

function SystemPromptDialog({
  value,
  onChange,
  onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      data-channel-dialog=""
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-prompt-title"
        className="flex h-[min(90vh,calc(100dvh-2rem))] w-[min(90vw,calc(100dvw-2rem))] flex-col rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Агент</p>
          <h2 id="system-prompt-title" className="mt-1 text-2xl font-semibold">
            Системная инструкция <span className="text-white">#ROLE</span>
          </h2>
        </div>
        <textarea
          ref={areaRef}
          className={`${fieldClass} mt-4 min-h-0 flex-1 resize-none`}
          value={value}
          autoFocus
          placeholder={promptPlaceholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="mt-3">
          <PromptVariables onInsert={(token) => insertPromptToken(areaRef.current, value, token, onChange)} />
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={onClose}>
            Готово
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PromptVariables({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-xs text-zinc-500">Вы можете использовать переменные в тексте:</p>
      {PROMPT_VARIABLES.map((item) => (
        <button
          key={item.token}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onInsert(item.token)}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-400 transition-colors hover:border-zinc-500 hover:text-zinc-200"
        >
          <span className="font-mono text-zinc-100">{item.token}</span>
          <span>— {item.label}</span>
        </button>
      ))}
    </div>
  );
}

function insertPromptToken(
  area: HTMLTextAreaElement | null,
  value: string,
  token: string,
  onChange: (value: string) => void,
) {
  const focused = area !== null && document.activeElement === area;
  const start = focused ? area.selectionStart : value.length;
  const end = focused ? area.selectionEnd : value.length;
  onChange(`${value.slice(0, start)}${token}${value.slice(end)}`);
  const cursor = start + token.length;
  requestAnimationFrame(() => {
    area?.focus();
    area?.setSelectionRange(cursor, cursor);
  });
}

const channelTone: Record<IntegrationProvider, string> = {
  telegram: "border border-zinc-700 bg-zinc-900 text-white",
  whatsapp: "border border-zinc-700 bg-zinc-900 text-white",
  instagram: "border border-zinc-700 bg-zinc-900 text-white",
  widget: "border border-zinc-700 bg-zinc-900 text-white",
};

function ChannelSettings({
  agent,
  agentId,
  initialOpenChannel,
  connectError,
  onConnectChannel,
  onConnectInstagram,
  credentials,
  phone,
  greenDefaults,
  channels,
  onChannelsChange,
  delays,
  onDelaysChange,
  onWhatsAppCredentials,
  onWhatsAppPhone,
  onWhatsAppCleared,
}: {
  agent: AgentRecord | null;
  agentId: string;
  initialOpenChannel?: "whatsapp" | "telegram" | "widget";
  connectError: string | null;
  /** Автосейв нового агента перед модалкой; false — сейв не удался, модалку не открываем. */
  onConnectChannel: (channel: "whatsapp" | "telegram" | "widget") => Promise<boolean>;
  onConnectInstagram: () => Promise<boolean>;
  credentials: GreenDefaults;
  phone: string;
  greenDefaults: GreenDefaults;
  channels: ActiveChannels;
  onChannelsChange: (channels: ActiveChannels) => void;
  delays: ChannelDelays;
  onDelaysChange: (delays: ChannelDelays) => void;
  onWhatsAppCredentials: (credentials: GreenDefaults) => void;
  onWhatsAppPhone: (phone: string) => void;
  onWhatsAppCleared: () => void;
}) {
  const [whatsappOpen, setWhatsappOpen] = useState(initialOpenChannel === "whatsapp");
  const [telegramOpen, setTelegramOpen] = useState(initialOpenChannel === "telegram");
  const [widgetOpen, setWidgetOpen] = useState(initialOpenChannel === "widget");
  const [connectingChannel, setConnectingChannel] = useState<"whatsapp" | "telegram" | "widget" | null>(null);

  // Физическое подключение: есть инстанс/номер WhatsApp или токен/сессия Telegram.
  // Пока канала нет, его тумблер заблокирован и принудительно выключен.
  const whatsappConnected = Boolean(credentials.instanceId || phone || agent?.waIsActive);
  const telegramConnected = agent ? isTelegramConnected(agent) : false;
  const instagramConnected = Boolean(agent?.igAccountId);
  const [instagramConnecting, setInstagramConnecting] = useState(false);

  async function handleInstagramConnect() {
    if (instagramConnecting) return;
    setInstagramConnecting(true);
    try {
      const started = await onConnectInstagram();
      // Успех — браузер уходит на Meta; сбрасываем флаг только если переход не начался.
      if (!started) setInstagramConnecting(false);
    } catch {
      setInstagramConnecting(false);
    }
  }

  async function handleConnect(channel: "whatsapp" | "telegram" | "widget") {
    if (connectingChannel) return;
    setConnectingChannel(channel);
    try {
      const ready = await onConnectChannel(channel);
      if (!ready) return;
      if (channel === "whatsapp") setWhatsappOpen(true);
      else if (channel === "telegram") setTelegramOpen(true);
      else setWidgetOpen(true);
    } finally {
      setConnectingChannel(null);
    }
  }

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md">
      <div>
        <h3 className="font-sans text-lg font-bold text-white">Активные каналы</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-400">
          У агента один номер WhatsApp и один Telegram-канал (бот или личный аккаунт). Выключенный канал не вызывает модель.
        </p>
      </div>
      <input
        type="hidden"
        name="active_channels"
        value={JSON.stringify({
          ...channels,
          whatsapp: whatsappConnected && channels.whatsapp,
          telegram: telegramConnected && channels.telegram,
          instagram: instagramConnected && channels.instagram,
        })}
      />
      <input type="hidden" name="channel_delays" value={JSON.stringify(delays)} />
      <input type="hidden" name="wa_instance_id" value={credentials.instanceId} />
      <input type="hidden" name="wa_api_token" value={credentials.apiToken} />
      <input type="hidden" name="wa_phone_number" value={phone} />
      {connectError ? <p className="text-sm text-red-400">{connectError}</p> : null}
      <div className="grid gap-3">
        <TwilioConnectCard />
        <div className="grid gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 text-sm font-medium text-zinc-200">
              <span className={`grid size-9 place-items-center rounded-xl ${channelTone.whatsapp}`}>
                <ChannelIcon provider="whatsapp" className="size-4" />
              </span>
              WhatsApp
            </span>
            <Switch
              checked={whatsappConnected && channels.whatsapp}
              disabled={!whatsappConnected}
              onCheckedChange={(checked) => onChannelsChange({ ...channels, whatsapp: checked })}
              aria-label="WhatsApp"
              title={whatsappConnected ? undefined : "Сначала подключите номер WhatsApp"}
            />
          </label>
          {whatsappConnected && channels.whatsapp ? (
            <ChannelDelay value={delays.whatsapp} onChange={(whatsapp) => onDelaysChange({ ...delays, whatsapp })} />
          ) : null}
          <WhatsAppChannel
            agentId={agentId}
            instanceId={credentials.instanceId}
            phone={phone}
            connecting={connectingChannel === "whatsapp"}
            onConnect={() => void handleConnect("whatsapp")}
            onPhoneSaved={onWhatsAppPhone}
            onCleared={onWhatsAppCleared}
          />
        </div>
        <div className="grid gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 text-sm font-medium text-zinc-200">
              <span className={`grid size-9 place-items-center rounded-xl ${channelTone.telegram}`}>
                <ChannelIcon provider="telegram" className="size-4" />
              </span>
              Telegram
            </span>
            <Switch
              checked={telegramConnected && channels.telegram}
              disabled={!telegramConnected}
              onCheckedChange={(checked) => onChannelsChange({ ...channels, telegram: checked })}
              aria-label="Telegram"
              title={telegramConnected ? undefined : "Сначала подключите Telegram"}
            />
          </label>
          {telegramConnected && channels.telegram ? (
            <ChannelDelay value={delays.telegram} onChange={(telegram) => onDelaysChange({ ...delays, telegram })} />
          ) : null}
          <TelegramChannel agent={agent} connecting={connectingChannel === "telegram"} onConnect={() => void handleConnect("telegram")} />
        </div>
        <div className="grid gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 text-sm font-medium text-zinc-200">
              <span className={`grid size-9 place-items-center rounded-xl ${channelTone.instagram}`}>
                <ChannelIcon provider="instagram" className="size-4" />
              </span>
              Instagram
            </span>
            <Switch
              checked={instagramConnected && channels.instagram}
              disabled={!instagramConnected}
              onCheckedChange={(checked) => onChannelsChange({ ...channels, instagram: checked })}
              aria-label="Instagram"
              title={instagramConnected ? undefined : "Сначала подключите Instagram"}
            />
          </label>
          {instagramConnected && channels.instagram ? (
            <ChannelDelay value={delays.instagram} onChange={(instagram) => onDelaysChange({ ...delays, instagram })} />
          ) : null}
          <InstagramChannel agent={agent} connecting={instagramConnecting} onConnect={() => void handleInstagramConnect()} />
          <Suspense fallback={null}>
            <InstagramNotice connected={instagramConnected} />
          </Suspense>
        </div>
        <div className="grid gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 text-sm font-medium text-zinc-200">
              <span className="grid size-9 place-items-center rounded-xl border border-zinc-700 bg-zinc-900 text-white">
                <Globe className="size-4" strokeWidth={2} />
              </span>
              Web Widget
            </span>
            <Switch
              checked={channels.widget}
              onCheckedChange={(checked) => onChannelsChange({ ...channels, widget: checked })}
              aria-label="Web Widget"
            />
          </label>
          {channels.widget ? (
            <ChannelDelay
              value={delays.web_widget}
              max={WIDGET_DELAY_CAP_SECONDS}
              onChange={(web_widget) => onDelaysChange({ ...delays, web_widget })}
            />
          ) : null}
          <button
            type="button"
            className="w-full rounded-xl bg-strike px-4 py-2.5 text-sm font-semibold text-white transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(207,2,52,0.45)] disabled:opacity-50"
            disabled={connectingChannel === "widget"}
            onClick={() => void handleConnect("widget")}
          >
            {connectingChannel === "widget" ? "Сохранение агента" : channels.widget ? "Настроить виджет" : "Подключить"}
          </button>
        </div>
      </div>
      {whatsappOpen ? (
        <WhatsAppConnectDialog
          agentId={agentId || agent?.id || ""}
          defaults={{
            instanceId: credentials.instanceId || greenDefaults.instanceId,
            apiToken: credentials.apiToken || greenDefaults.apiToken,
          }}
          onApply={onWhatsAppCredentials}
          onClose={() => setWhatsappOpen(false)}
        />
      ) : null}
      {telegramOpen && agentId ? (
        <TelegramConnectModal
          agentId={agentId}
          initialType={agent?.telegram_type ?? "bot"}
          initialPhone={agent?.telegram_phone ?? ""}
          initialApiId={agent?.telegram_api_id ?? ""}
          onClose={() => setTelegramOpen(false)}
        />
      ) : null}
      {widgetOpen && agentId ? (
        <WidgetConnectModal
          agentId={agentId}
          initialSettings={readWidgetSettings(agent ? { ...agent } : undefined)}
          onClose={() => setWidgetOpen(false)}
          // Сохранённые настройки = виджет инициализирован: включаем тумблер.
          onSaved={() => {
            if (!channels.widget) onChannelsChange({ ...channels, widget: true });
          }}
        />
      ) : null}
    </section>
  );
}

function WhatsAppChannel({
  agentId,
  instanceId,
  phone,
  connecting,
  onConnect,
  onPhoneSaved,
  onCleared,
}: {
  agentId: string;
  instanceId: string;
  phone: string;
  connecting: boolean;
  onConnect: () => void;
  onPhoneSaved: (phone: string) => void;
  onCleared: () => void;
}) {
  const savedPhone = phone && phone !== instanceId ? phone : "";
  if (!instanceId && !savedPhone) {
    return (
      <button
        type="button"
        className="w-full rounded-xl bg-strike px-4 py-2.5 text-sm font-semibold text-white transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(207,2,52,0.45)] disabled:opacity-50"
        disabled={connecting}
        onClick={onConnect}
      >
        {connecting ? "Сохранение агента" : "+ Подключить номер"}
      </button>
    );
  }
  if (!savedPhone) {
    return <WhatsAppPhoneField agentId={agentId} onSaved={onPhoneSaved} />;
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
      <p className="truncate text-sm font-medium text-white">{savedPhone}</p>
      <DisconnectButton
        agentId={agentId}
        kind="whatsapp"
        label={`Отключить номер ${savedPhone}`}
        onDisconnected={onCleared}
      />
    </div>
  );
}

function WhatsAppPhoneField({ agentId, onSaved }: { agentId: string; onSaved: (phone: string) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function savePhone() {
    const digits = value.replace(/@c\.us$/i, "").replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(digits)) {
      setError("Введите номер в международном формате, например 79991234567.");
      return;
    }
    setError(null);
    if (!agentId) {
      onSaved(digits);
      return;
    }
    startTransition(async () => {
      const result = await saveWhatsAppPhone(agentId, digits);
      if (!result.ok || !result.phone) {
        setError(result.error ?? "Не удалось сохранить номер.");
        return;
      }
      onSaved(result.phone);
    });
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-black px-3 py-2">
        <input
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-zinc-600"
          value={value}
          inputMode="numeric"
          autoComplete="tel"
          placeholder="79991234567"
          aria-label="Номер WhatsApp"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            savePhone();
          }}
        />
        <button
          type="button"
          className="shrink-0 rounded-lg bg-strike px-3 py-1.5 text-sm font-semibold text-white transition-shadow hover:shadow-[0_0_15px_rgba(207,2,52,0.45)] disabled:opacity-50"
          disabled={pending}
          onClick={savePhone}
        >
          {pending ? "Сохранение" : "Сохранить"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
}

function TelegramChannel({
  agent,
  connecting,
  onConnect,
}: {
  agent: AgentRecord | null;
  connecting: boolean;
  onConnect: () => void;
}) {
  // Кнопка видна всегда: для нового агента onConnect сначала автосохранит его.
  // Подключён: подпись (@username бота или номер личного аккаунта) + корзина;
  // переключатель вкл/выкл — Switch канала Telegram в заголовке блока выше
  // (как у WhatsApp), он правит active_channels.telegram.
  const label = agent ? telegramChannelLabel(agent) : null;
  if (!agent || !isTelegramConnected(agent) || !label) {
    return (
      <button
        type="button"
        className="w-full rounded-xl bg-strike px-4 py-2.5 text-sm font-semibold text-white transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(207,2,52,0.45)] disabled:opacity-50"
        disabled={connecting}
        onClick={onConnect}
      >
        {connecting ? "Сохранение агента" : "Подключить"}
      </button>
    );
  }
  const isUserbot = agent.telegram_type === "userbot";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{label}</p>
        <p className="text-xs text-zinc-400">{isUserbot ? "Личный аккаунт" : "Telegram Bot"}</p>
      </div>
      <DisconnectButton
        agentId={agent.id}
        kind="telegram"
        label={isUserbot ? `Отключить личный аккаунт ${label}` : `Отключить бота ${label}`}
      />
    </div>
  );
}

function InstagramChannel({ agent, connecting, onConnect }: { agent: AgentRecord | null; connecting: boolean; onConnect: () => void }) {
  if (!agent?.igAccountId) {
    return (
      <button
        type="button"
        className="w-full rounded-xl bg-strike px-4 py-2.5 text-sm font-semibold text-white transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(207,2,52,0.45)] disabled:opacity-50"
        disabled={connecting}
        onClick={onConnect}
      >
        {connecting ? "Переход в Meta…" : "Подключить Instagram"}
      </button>
    );
  }
  const username = agent.igUsername ? `@${agent.igUsername.replace(/^@/, "")}` : "Instagram";
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        {agent.igAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={agent.igAvatarUrl} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full border border-zinc-800 object-cover" />
        ) : (
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-zinc-800 bg-zinc-900 text-zinc-400">
            <ChannelIcon provider="instagram" className="size-4" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{username}</p>
          <p className="text-xs text-zinc-400">Instagram Direct</p>
        </div>
      </div>
      <DisconnectButton agentId={agent.id} kind="instagram" label={`Отключить Instagram ${username}`} />
    </div>
  );
}

/** Результат OAuth после возврата с Meta: ?ig=connected или ?ig_error=... */
function InstagramNotice({ connected }: { connected: boolean }) {
  const params = useSearchParams();
  // Параметры остаются в URL после возврата с Meta, поэтому сверяем их с текущим состоянием канала:
  // «подключён» — только пока аккаунт привязан, ошибка — только пока он не привязан.
  if (!connected && params.get("ig_error")) return <p className="text-sm text-red-400">{params.get("ig_error")}</p>;
  if (connected && params.get("ig") === "connected") return <p className="text-sm text-emerald-400">Instagram подключён.</p>;
  return null;
}

function DisconnectButton({
  agentId,
  kind,
  label,
  onDisconnected,
}: {
  agentId: string;
  kind: "whatsapp" | "telegram" | "instagram" | "widget";
  label: string;
  onDisconnected?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDisconnect() {
    setError(null);
    startTransition(async () => {
      if (agentId) {
        const result =
          kind === "whatsapp"
            ? await disconnectWhatsApp(agentId)
            : kind === "instagram"
              ? await disconnectInstagram(agentId)
              : await disconnectTelegram(agentId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(kind === "instagram" ? "Instagram отключён" : "Подключение удалено");
        void swrMutate("/api/agents");
        router.refresh();
      }
      onDisconnected?.();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
      <AlertDialog>
        <AlertDialogTrigger type="button" className="text-red-500 transition-colors hover:text-red-400 disabled:opacity-40" disabled={pending} aria-label={label}>
          <Trash className="size-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отключить</AlertDialogTitle>
            <AlertDialogDescription>
              {kind === "whatsapp"
                ? "Номер будет снят с этого агента. История чатов сохранится."
                : kind === "instagram"
                  ? "Instagram-аккаунт будет отвязан от этого агента. История чатов сохранится."
                  : "Подключение Telegram (токен бота или данные личного аккаунта) будет очищено у этого агента. История чатов сохранится."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction type="button" className="bg-red-600 text-white hover:bg-red-700" onClick={onDisconnect}>
              Отключить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const channelDelayPresets = [0, 10, 20, 30, 60];

/** Компактная настройка задержки ответа внутри карточки канала (показывается, когда канал включён). */
function ChannelDelay({ value, onChange, max = MAX_CHANNEL_DELAY_SECONDS }: { value: number; onChange: (value: number) => void; max?: number }) {
  const presets = channelDelayPresets.filter((preset) => preset <= max);
  const set = (next: number) => onChange(Math.min(max, Math.max(0, Math.round(Number.isFinite(next) ? next : 0))));

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-zinc-800/40 px-3 py-2.5">
      <label className="flex items-center gap-2 text-xs font-medium text-zinc-300">
        Задержка ответа
        <input
          type="number"
          min={0}
          max={max}
          step={1}
          value={value}
          aria-label="Задержка ответа в секундах"
          onChange={(event) => set(Number(event.target.value))}
          className="w-16 rounded-lg border border-zinc-800 bg-black px-2 py-1 text-center text-sm text-white outline-none transition-colors hover:border-zinc-700 focus:border-white"
        />
        <span className="text-zinc-400">сек</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => set(preset)}
            className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
              value === preset ? "border-strike bg-strike/10 text-white" : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-white"
            }`}
          >
            {preset}
          </button>
        ))}
      </div>
      <p className="basis-full text-[11px] leading-4 text-zinc-400">
        Пауза перед отправкой ответа{max < MAX_CHANNEL_DELAY_SECONDS ? ` (не больше ${max} с)` : ""}. На это время клиент видит, что агент печатает.
      </p>
    </div>
  );
}
function HumanHandoffField({
  value,
  onChange,
}: {
  value: HandoffDuration;
  onChange: (value: HandoffDuration) => void;
}) {
  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md">
      <div className="grid gap-2">
        <h3 className="font-sans text-lg font-bold text-white">Вмешательство оператора</h3>
        <p className="text-sm leading-6 text-zinc-400">
          На какое время бот замолчит, если вы ответите клиенту вручную с телефона или ПК.
        </p>
      </div>
      <label className="grid gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Пауза</span>
        <SelectField
          name="human_handoff_duration"
          value={value}
          options={HANDOFF_DURATIONS.map((option) => ({ value: option.value, label: option.label }))}
          onChange={(next) => onChange(next as HandoffDuration)}
        />
      </label>
    </section>
  );
}

function LeadNotificationsField({
  value,
  onChange,
  emailEnabled,
  emailAddress,
  onEmailEnabled,
  onEmailAddress,
}: {
  value: string;
  onChange: (value: string) => void;
  emailEnabled: boolean;
  emailAddress: string;
  onEmailEnabled: (enabled: boolean) => void;
  onEmailAddress: (address: string) => void;
}) {
  const [enabled, setEnabled] = useState(() => value.trim().length > 0);

  function toggle(next: boolean) {
    setEnabled(next);
    if (!next) onChange("");
  }

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md">
      <h3 className="font-sans text-lg font-bold text-white">Уведомления о лидах</h3>
      <input type="hidden" name="notify_email_enabled" value={emailEnabled ? "true" : "false"} />
      {enabled ? null : <input type="hidden" name="telegram_chat_id" value="" />}
      {emailEnabled ? null : <input type="hidden" name="notify_email_address" value={emailAddress} />}
      <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
        <span className="text-sm font-medium text-zinc-200">Включить уведомления</span>
        <Switch checked={enabled} onCheckedChange={toggle} aria-label="Включить уведомления" />
      </label>
      {enabled ? (
        <>
          <p className="text-sm leading-6 text-zinc-400">
            Сюда будут приходить горячие лиды. Создайте группу в Telegram и добавьте в неё нашего бота @StrikeNotifyBot.
          </p>
          <label className="grid gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Chat ID</span>
            <input
              className={fieldClass}
              name="telegram_chat_id"
              type="text"
              autoComplete="off"
              value={value}
              placeholder="Например: -100123456789"
              onChange={(event) => onChange(event.target.value)}
            />
            <span className="text-xs leading-5 text-zinc-400">
              Как узнать ID? Перешлите любое сообщение из вашей созданной группы боту @getmyid_bot и скопируйте
              полученное число (с минусом).
            </span>
          </label>
        </>
      ) : null}
      <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
        <span className="text-sm font-medium text-zinc-200">Отправлять лиды на Email</span>
        <Switch checked={emailEnabled} onCheckedChange={onEmailEnabled} aria-label="Отправлять лиды на Email" />
      </label>
      {emailEnabled ? (
        <label className="grid gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Email</span>
          <input
            className={fieldClass}
            name="notify_email_address"
            type="email"
            autoComplete="email"
            value={emailAddress}
            placeholder="Введите email для уведомлений"
            onChange={(event) => onEmailAddress(event.target.value)}
          />
        </label>
      ) : null}
    </section>
  );
}

function MessageLimitsField({
  agentLimit,
  clientLimit,
  totalLimit,
  onChange,
}: {
  agentLimit: string;
  clientLimit: string;
  totalLimit: string;
  onChange: (patch: Partial<AgentDraft>) => void;
}) {
  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md">
      <div className="grid gap-2">
        <h3 className="font-sans text-lg font-bold text-white">Защита от зацикливания (Лимиты)</h3>
        <p className="text-sm leading-6 text-zinc-400">
          Если указан 0, лимит отключен. При превышении лимита бот автоматически перейдет в статус &apos;На паузе&apos; для
          этого диалога.
        </p>
      </div>
      <LimitInput
        label="Лимит сообщений от агента"
        name="limit_agent_messages"
        value={agentLimit}
        onChange={(limit_agent_messages) => onChange({ limit_agent_messages })}
      />
      <LimitInput
        label="Лимит сообщений от клиента"
        name="limit_client_messages"
        value={clientLimit}
        onChange={(limit_client_messages) => onChange({ limit_client_messages })}
      />
      <LimitInput
        label="Общий лимит сообщений в диалоге"
        name="limit_total_messages"
        value={totalLimit}
        onChange={(limit_total_messages) => onChange({ limit_total_messages })}
      />
    </section>
  );
}

function LimitInput({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{label}</span>
      <input
        className={fieldClass}
        name={name}
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SplitMessagesField({ enabled, onChange }: { enabled: boolean; onChange: (enabled: boolean) => void }) {

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md">
      <h3 className="font-sans text-lg font-bold text-white">Форматирование</h3>
      <input type="hidden" name="split_messages" value={enabled ? "true" : "false"} />
      <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
        <span className="text-sm font-medium text-zinc-200">Дробить текст на отдельные сообщения</span>
        <Switch checked={enabled} onCheckedChange={onChange} aria-label="Дробить текст на отдельные сообщения" />
      </label>
      <p className="text-sm leading-6 text-zinc-400">
        Если включено, абзацы будут отправляться отдельными сообщениями (пузырями) с учетом задержки между ними
      </p>
    </section>
  );
}

function FollowupField({
  enabled,
  intervalHours,
  maxCount,
  template,
  onChange,
}: {
  enabled: boolean;
  intervalHours: string;
  maxCount: string;
  template: string;
  onChange: (patch: Partial<AgentDraft>) => void;
}) {
  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-sm p-6 backdrop-blur-md">
      <div className="grid gap-2">
        <h3 className="font-sans text-lg font-bold text-white">Умные напоминания (Follow-up)</h3>
        <p className="text-sm leading-6 text-zinc-400">
          Если клиент перестал отвечать, ИИ сам решит, уместно ли напомнить о себе. Отказавшимся клиентам и диалогам,
          где мы ждём действия от себя, напоминания не уходят.
        </p>
      </div>
      <input type="hidden" name="followup_enabled" value={enabled ? "true" : "false"} />
      <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
        <span className="text-sm font-medium text-zinc-200">Включить напоминания</span>
        <Switch
          checked={enabled}
          onCheckedChange={(followup_enabled) => onChange({ followup_enabled })}
          aria-label="Включить напоминания"
        />
      </label>
      {enabled ? (
        <>
          <label className="grid gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Интервал ожидания (в часах)
            </span>
            <input
              className={fieldClass}
              name="followup_interval_hours"
              type="number"
              min={1}
              step={1}
              value={intervalHours}
              onChange={(event) => onChange({ followup_interval_hours: event.target.value })}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Лимит напоминаний
            </span>
            <input
              className={fieldClass}
              name="followup_max_count"
              type="number"
              min={0}
              step={1}
              value={maxCount}
              onChange={(event) => onChange({ followup_max_count: event.target.value })}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Инструкция / Шаблон для пуша
            </span>
            <textarea
              className={`${fieldClass} min-h-28 resize-y`}
              name="followup_template"
              maxLength={2000}
              value={template}
              placeholder="Например: Спроси, посмотрел ли клиент видео"
              onChange={(event) => onChange({ followup_template: event.target.value })}
            />
            <span className="text-xs leading-5 text-zinc-400">
              Если заполнено, бот будет опираться на этот текст (например: &apos;Спроси, посмотрел ли клиент видео&apos;).
              Если оставить пустым, бот придумает текст сам
            </span>
          </label>
        </>
      ) : (
        <>
          <input type="hidden" name="followup_interval_hours" value={intervalHours} />
          <input type="hidden" name="followup_max_count" value={maxCount} />
          <input type="hidden" name="followup_template" value={template} />
        </>
      )}
    </section>
  );
}

const CREATIVITY_MODES = [
  { value: "0.1", label: "Точный и строгий", hint: "Ответы строго по инструкции" },
  { value: "0.7", label: "Сбалансированный", hint: "Естественная живая речь" },
  { value: "0.9", label: "Креативный", hint: "Максимум свободы формулировок" },
] as const;

/** Старые произвольные значения температуры показываем ближайшим режимом, не переписывая их без действий пользователя. */
function creativityModeFor(value: string) {
  const n = Number(value);
  if (!Number.isFinite(n)) return CREATIVITY_MODES[1].value;
  if (n < 0.45) return CREATIVITY_MODES[0].value;
  if (n < 0.8) return CREATIVITY_MODES[1].value;
  return CREATIVITY_MODES[2].value;
}

function CreativityField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [hintOpen, setHintOpen] = useState(false);
  const selected = creativityModeFor(value);

  return (
    <div className="block text-sm font-medium text-zinc-300">
      <span className="flex items-center gap-2">
        Креативность ответов
        <span className="relative inline-flex">
          <button
            type="button"
            aria-label="Что такое креативность ответов"
            aria-expanded={hintOpen}
            onClick={() => setHintOpen((open) => !open)}
            onBlur={() => setHintOpen(false)}
            className="flex size-5 items-center justify-center rounded-full border border-zinc-700 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
          >
            ?
          </button>
          {hintOpen ? (
            <span
              role="tooltip"
              className="absolute left-7 top-1/2 z-20 w-72 -translate-y-1/2 whitespace-pre-line rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-xs font-normal leading-5 text-zinc-300 shadow-lg"
            >
              Точный и строгий — агент отвечает строго по инструкциям, без лишних вольностей.
              {"\n"}Сбалансированный — естественная, живая речь.
              {"\n"}Креативный — максимальная свобода и разнообразие формулировок.
            </span>
          ) : null}
        </span>
      </span>
      <input type="hidden" name="temperature" value={value} />
      <div role="radiogroup" aria-label="Креативность ответов" className="mt-2 grid gap-2 sm:grid-cols-3">
        {CREATIVITY_MODES.map((mode) => {
          const active = mode.value === selected;
          return (
            <button
              key={mode.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(mode.value)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors duration-200 ${
                active ? "border-rose-500 bg-rose-50" : "border-gray-200 bg-[#ffffff] hover:bg-gray-50"
              }`}
            >
              <span className={`block text-sm font-medium ${active ? "text-rose-900" : "text-gray-900"}`}>{mode.label}</span>
              <span className={`mt-0.5 block text-xs font-normal ${active ? "text-rose-700" : "text-gray-500"}`}>{mode.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}