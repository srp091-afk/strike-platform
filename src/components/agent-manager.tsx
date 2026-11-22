"use client";

import { GripVertical, Globe, Loader2, Mail, Maximize, MessageSquareText, Play, Sparkles, Trash } from "lucide-react";
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
import { startTransition, Suspense, useActionState, useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
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
import { ChannelAccordionCard } from "@/components/channel-accordion-card";
import { ChannelIcon } from "@/components/channel-icons";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { WIDGET_ANALYTICS_GOALS } from "@/lib/widget-analytics";
import { AgentKnowledge } from "@/components/agent-knowledge";
import {
  AmoCrmIcon,
  BitrixIcon,
  DikidiIcon,
  GoogleAnalyticsIcon,
  GoogleCalendarIcon,
  IntegrationAccordionCard,
  PaymentNoticeIcon,
  PipedriveIcon,
  ProdamusIcon,
  StripeIcon,
  WebhookIcon,
  YandexMetrikaIcon,
  YclientsIcon,
  YookassaIcon,
} from "@/components/integration-accordion-card";
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
const platformTabActive = "rounded-xl border border-white bg-black px-3 py-2 text-xs font-semibold text-white";
const platformTabIdle = "rounded-xl border border-zinc-800 bg-black px-3 py-2 text-xs font-semibold text-zinc-400";

function ruNoun(count: number, one: string, few: string, many: string) {
  const n = Math.abs(count);
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? one : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? few : many;
  return `${n} ${word}`;
}

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

const CARD_CHANNELS: Array<{ provider: Exclude<IntegrationProvider, "sms" | "viber" | "email" | "messenger">; label: string; activeClass: string }> = [
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
  { value: "behavior", label: "Поведение" },
  { value: "integrations", label: "Интеграции" },
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
    <IntegrationAccordionCard
      title="Google Calendar"
      description="Свободные слоты и запись клиента на встречу в диалоге."
      connected={isConnected}
      icon={<GoogleCalendarIcon />}
    >
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
    </IntegrationAccordionCard>
  );
}

function YclientsCard({
  agentId,
  connected,
  platform,
  companyId,
  partnerToken,
  userToken,
  onChange,
}: {
  agentId: string;
  connected: boolean;
  platform: "yclients" | "altegio";
  companyId: string;
  partnerToken: string;
  userToken: string;
  onChange: (patch: {
    yclients_platform?: "yclients" | "altegio";
    yclients_company_id?: string;
    yclients_partner_token?: string;
    yclients_user_token?: string;
  }) => void;
}) {
  const router = useRouter();
  const [isConnected, setConnected] = useState(connected);
  const [tokenOpen, setTokenOpen] = useState(!connected);
  const [pending, setPending] = useState<"test" | "off" | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setConnected(connected);
    setTokenOpen(!connected);
  }, [connected, agentId]);

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
    setResult("");
    try {
      const response = await fetch(`/api/agents/${agentId}/yclients/test`, {
        method: "POST",
        credentials: "same-origin",
        headers: await accountHeaders(),
        body: JSON.stringify({
          platform,
          companyId: companyId.trim(),
          partnerToken: partnerToken.trim(),
          userToken: userToken.trim(),
        }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; servicesCount?: number; staffCount?: number } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Не удалось подключиться к YCLIENTS.");
        return;
      }
      const message = `Подключено: найдено ${ruNoun(data.servicesCount ?? 0, "услуга", "услуги", "услуг")} и ${ruNoun(data.staffCount ?? 0, "мастер", "мастера", "мастеров")}`;
      setResult(message);
      toast.success(message);
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
      const response = await fetch(`/api/agents/${agentId}/yclients`, { method: "DELETE", credentials: "same-origin", headers });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(data?.error || "Не удалось отключить YCLIENTS.");
        return;
      }
      setConnected(false);
      setTokenOpen(true);
      setResult("");
      onChange({ yclients_partner_token: "", yclients_user_token: "" });
      toast.success("YCLIENTS отключён");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const canTest = Boolean(companyId.trim()) && (Boolean(partnerToken.trim()) || isConnected);

  return (
    <IntegrationAccordionCard
      title="YCLIENTS / Altegio"
      description="Онлайн-запись к мастерам, проверка услуг и свободных окошек в реальном времени."
      connected={isConnected}
      icon={<YclientsIcon />}
    >
      <div className="grid gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Платформа</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ yclients_platform: "yclients" })}
            className={platform === "yclients" ? platformTabActive : platformTabIdle}
          >
            YCLIENTS
          </button>
          <button
            type="button"
            onClick={() => onChange({ yclients_platform: "altegio" })}
            className={platform === "altegio" ? platformTabActive : platformTabIdle}
          >
            Altegio
          </button>
        </div>
        <input type="hidden" name="yclients_platform" value={platform} />
      </div>
      <label className="grid gap-2 text-sm text-zinc-300">
        ID филиала (Company ID)
        <input
          name="yclients_company_id"
          value={companyId}
          onChange={(event) => onChange({ yclients_company_id: event.target.value })}
          placeholder="123456"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          className={fieldClass}
        />
      </label>
      {tokenOpen ? (
        <>
          <label className="grid gap-2 text-sm text-zinc-300">
            Partner Token
            <input
              name="yclients_partner_token"
              type="password"
              value={partnerToken}
              onChange={(event) => onChange({ yclients_partner_token: event.target.value })}
              placeholder={isConnected ? "Новый Partner Token" : "Partner Token"}
              autoComplete="new-password"
              spellCheck={false}
              className={fieldClass}
            />
          </label>
          <label className="grid gap-2 text-sm text-zinc-300">
            User Token (необязательно)
            <input
              name="yclients_user_token"
              type="password"
              value={userToken}
              onChange={(event) => onChange({ yclients_user_token: event.target.value })}
              placeholder="User Token"
              autoComplete="new-password"
              spellCheck={false}
              className={fieldClass}
            />
          </label>
          <p className="text-xs leading-5 text-zinc-500">Partner Token берётся в маркетплейсе интеграций YCLIENTS или Altegio. User Token нужен только для расширенного доступа.</p>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!agentId || !canTest || pending !== null} onClick={() => void checkConnection()}>
          {pending === "test" ? "Проверяем..." : "Проверить подключение"}
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
      {result ? <p className="text-sm text-emerald-400">{result}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {!agentId ? <p className="text-sm leading-6 text-zinc-400">Сначала сохраните агента, чтобы проверить подключение.</p> : null}
    </IntegrationAccordionCard>
  );
}

function DikidiCard({
  url,
  onChange,
}: {
  url: string;
  onChange: (patch: { dikidi_booking_url?: string }) => void;
}) {
  return (
    <IntegrationAccordionCard
      title="DIKIDI"
      description="Умное направление клиентов на онлайн-запись DIKIDI прямо из диалога."
      connected={Boolean(url.trim())}
      icon={<DikidiIcon />}
    >
      <label className="grid gap-2 text-sm text-zinc-300">
        Прямая ссылка на онлайн-запись DIKIDI
        <input
          name="dikidi_booking_url"
          value={url}
          onChange={(event) => onChange({ dikidi_booking_url: event.target.value })}
          placeholder="https://dikidi.net/..."
          autoComplete="off"
          spellCheck={false}
          className={fieldClass}
        />
      </label>
      <p className="text-xs leading-5 text-zinc-500">
        У DIKIDI нет открытого публичного API для внешней записи, поэтому ИИ-администратор проконсультирует клиента по услугам и ценам, а затем отправит прямую ссылку на выбор свободного окна.
      </p>
    </IntegrationAccordionCard>
  );
}

const STRIPE_CURRENCIES = ["usd", "eur", "gbp", "gel"] as const;

function PaymentSetupHint({ title = "Как подключить за 2 минуты", children }: { title?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3.5 py-3">
      <p className="text-xs font-semibold text-zinc-200">{title}</p>
      <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-5 text-zinc-400 marker:text-zinc-500 [&_code]:font-mono [&_code]:text-[11px] [&_strong]:font-semibold [&_strong]:text-zinc-200">
        {children}
      </ol>
    </div>
  );
}

function AnalyticsGoalList() {
  async function copy(name: string) {
    try {
      await navigator.clipboard.writeText(name);
      toast.success("Цель скопирована");
    } catch {
      toast.error("Не удалось скопировать цель.");
    }
  }

  return (
    <ul className="grid gap-2">
      {WIDGET_ANALYTICS_GOALS.map((goal) => (
        <li key={goal.name} className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <code className="block truncate font-mono text-[11px] text-zinc-200">{goal.name}</code>
            <span className="block truncate text-xs leading-5 text-zinc-400">{goal.hint}</span>
          </span>
          <button
            type="button"
            onClick={() => void copy(goal.name)}
            className="shrink-0 rounded-xl border border-zinc-800 bg-black px-2.5 py-1.5 text-[11px] text-white transition-colors hover:border-zinc-700"
          >
            Скопировать
          </button>
        </li>
      ))}
    </ul>
  );
}

function YandexMetrikaCard({
  counterId,
  onChange,
}: {
  counterId: string;
  onChange: (patch: { ym_counter_id: string }) => void;
}) {
  return (
    <IntegrationAccordionCard
      title="Яндекс.Метрика"
      description="Автоматическая передача целей из веб-виджета в Метрику для обучения Яндекс.Директа."
      connected={/^\d{1,20}$/.test(counterId.trim())}
      icon={<YandexMetrikaIcon />}
    >
      <label className="grid gap-2 text-sm text-zinc-300">
        ID счётчика Яндекс.Метрики
        <input
          name="ym_counter_id"
          value={counterId}
          onChange={(event) => onChange({ ym_counter_id: event.target.value })}
          placeholder="98765432"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          className={fieldClass}
        />
      </label>
      <AnalyticsGoalList />
      <PaymentSetupHint title="Как настроить цель за 2 минуты">
        <li>Скопируйте номер счётчика в шапке Яндекс.Метрики и вставьте в поле выше.</li>
        <li>
          В Метрике откройте <strong>Цели → Добавить цель → JavaScript-событие</strong>.
        </li>
        <li>
          В поле «Идентификатор цели» вставьте нужное событие из списка (например, <code>strike_phone_submitted</code>) и сохраните.
        </li>
      </PaymentSetupHint>
    </IntegrationAccordionCard>
  );
}

function Ga4Card({
  enabled,
  measurementId,
  onChange,
}: {
  enabled: boolean;
  measurementId: string;
  onChange: (patch: { ga4_enabled?: boolean; ga4_measurement_id?: string }) => void;
}) {
  const connected = enabled || /^G-[A-Z0-9]{6,12}$/i.test(measurementId.trim());
  return (
    <IntegrationAccordionCard
      title="Google Analytics 4 (GA4)"
      description="Отправка событий виджета в GA4 и Google Tag Manager для оптимизации Google Ads."
      connected={connected}
      icon={<GoogleAnalyticsIcon />}
    >
      <input type="hidden" name="ga4_enabled" value={enabled ? "true" : "false"} />
      <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
        <span className="text-sm font-medium text-zinc-200">Отправлять события в GA4 / GTM</span>
        <Switch checked={enabled} onCheckedChange={(ga4_enabled) => onChange({ ga4_enabled })} aria-label="Отправлять события в GA4 / GTM" />
      </label>
      <label className="grid gap-2 text-sm text-zinc-300">
        Measurement ID (опционально)
        <input
          name="ga4_measurement_id"
          value={measurementId}
          onChange={(event) => onChange({ ga4_measurement_id: event.target.value })}
          placeholder="G-XXXXXXXXXX"
          autoComplete="off"
          spellCheck={false}
          className={fieldClass}
        />
        <span className="text-xs leading-5 text-zinc-400">Если на сайте один счётчик, можно оставить пустым.</span>
      </label>
      <AnalyticsGoalList />
      <PaymentSetupHint title="Как настроить за 2 минуты">
        <li>
          Убедитесь, что на сайте установлен стандартный код GA4 (<code>gtag.js</code>) или Google Tag Manager.
        </li>
        <li>Включите отправку выше и сохраните агента.</li>
        <li>
          В GA4 откройте <strong>Администратор → События</strong> и отметьте нужные события (например, <code>strike_phone_submitted</code>) как <strong>Ключевые события (Key Events)</strong> для передачи в Google Ads.
        </li>
      </PaymentSetupHint>
    </IntegrationAccordionCard>
  );
}

function PaymentWebhookField({ url }: { url: string }) {
  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Ссылка скопирована");
    } catch {
      toast.error("Не удалось скопировать ссылку.");
    }
  }

  return (
    <div className="grid gap-2">
      <span className="text-sm text-zinc-300">Webhook URL</span>
      <div className="flex items-center gap-2">
        <input readOnly value={url} placeholder="Сначала сохраните агента" className={fieldClass} />
        <button type="button" onClick={() => void copy()} disabled={!url} className="shrink-0 rounded-xl border border-zinc-800 bg-black px-3 py-3 text-xs text-white transition-colors hover:border-zinc-700 disabled:opacity-40">
          Скопировать
        </button>
      </div>
    </div>
  );
}

function StripeCard({
  agentId,
  connected,
  currency,
  secret,
  webhookSecret,
  onChange,
}: {
  agentId: string;
  connected: boolean;
  currency: string;
  secret: string;
  webhookSecret: string;
  onChange: (patch: { stripe_currency?: string; stripe_secret_key?: string; stripe_webhook_secret?: string }) => void;
}) {
  const router = useRouter();
  const [isConnected, setConnected] = useState(connected);
  const [tokenOpen, setTokenOpen] = useState(!connected);
  const [pending, setPending] = useState<"test" | "off" | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setConnected(connected);
    setTokenOpen(!connected);
  }, [connected, agentId]);

  async function check() {
    if (!agentId) {
      toast.error("Сначала сохраните агента.");
      return;
    }
    setPending("test");
    setResult("");
    setError("");
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountId = activeAccountHeader();
      if (accountId) headers.set("x-account-id", accountId);
      const response = await fetch(`/api/agents/${agentId}/payments/test`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ provider: "stripe", stripeSecretKey: secret.trim() }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Не удалось подключиться к Stripe.");
        return;
      }
      setResult("Подключено: Stripe отвечает.");
      toast.success("Stripe отвечает");
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
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountId = activeAccountHeader();
      if (accountId) headers.set("x-account-id", accountId);
      const response = await fetch(`/api/agents/${agentId}/payments`, {
        method: "DELETE",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ provider: "stripe" }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(data?.error || "Не удалось отключить Stripe.");
        return;
      }
      setConnected(false);
      setTokenOpen(true);
      setResult("");
      onChange({ stripe_secret_key: "", stripe_webhook_secret: "" });
      toast.success("Stripe отключён");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const webhookUrl = agentId ? `https://www.strikeplatform.io/api/webhooks/payments/stripe/${agentId}` : "";

  return (
    <IntegrationAccordionCard
      title="Stripe"
      description="Платёжная ссылка Checkout прямо в диалоге и подтверждение оплаты."
      connected={isConnected}
      icon={<StripeIcon />}
    >
      <label className="grid max-w-xs gap-2 text-sm text-zinc-300">
        Валюта по умолчанию
        <select name="stripe_currency" value={currency} onChange={(event) => onChange({ stripe_currency: event.target.value })} className={fieldClass}>
          {STRIPE_CURRENCIES.map((item) => (
            <option key={item} value={item}>{item.toUpperCase()}</option>
          ))}
        </select>
      </label>
      {tokenOpen ? (
        <>
          <label className="grid gap-2 text-sm text-zinc-300">
            Secret Key
            <input name="stripe_secret_key" type="password" value={secret} onChange={(event) => onChange({ stripe_secret_key: event.target.value })} placeholder="sk_live_... или sk_test_..." autoComplete="new-password" spellCheck={false} className={fieldClass} />
          </label>
          <label className="grid gap-2 text-sm text-zinc-300">
            Webhook Secret
            <input name="stripe_webhook_secret" type="password" value={webhookSecret} onChange={(event) => onChange({ stripe_webhook_secret: event.target.value })} placeholder="whsec_..." autoComplete="new-password" spellCheck={false} className={fieldClass} />
          </label>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!agentId || pending !== null || (!secret.trim() && !isConnected)} onClick={() => void check()}>
          {pending === "test" ? "Проверяем..." : "Проверить подключение"}
        </Button>
        {isConnected ? (
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => setTokenOpen((current) => !current)}>Обновить ключ</Button>
            <Button type="button" variant="outline" disabled={pending === "off"} onClick={() => void disconnect()}>{pending === "off" ? "Отключаем..." : "Отключить"}</Button>
          </>
        ) : null}
      </div>
      {result ? <p className="text-sm text-emerald-400">{result}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <PaymentSetupHint>
        <li>В кабинете Stripe откройте <strong>Developers → API keys</strong> и скопируйте <strong>Secret key</strong> (<code>sk_live_...</code> или <code>sk_test_...</code> для тестов).</li>
        <li>Перейдите в <strong>Developers → Webhooks → Add endpoint</strong>, вставьте <strong>Webhook URL</strong> ниже и выберите событие <code>checkout.session.completed</code>.</li>
        <li>После создания вебхука откройте его, нажмите <strong>Reveal</strong> рядом с <strong>Signing secret</strong> (<code>whsec_...</code>) и вставьте в поле <strong>Webhook Secret</strong> (без него STRIKE не сможет подтверждать оплаты).</li>
      </PaymentSetupHint>
      <PaymentWebhookField url={webhookUrl} />
    </IntegrationAccordionCard>
  );
}

function YookassaCard({
  agentId,
  connected,
  shopId,
  secret,
  onChange,
}: {
  agentId: string;
  connected: boolean;
  shopId: string;
  secret: string;
  onChange: (patch: { yookassa_shop_id?: string; yookassa_secret_key?: string }) => void;
}) {
  const router = useRouter();
  const [isConnected, setConnected] = useState(connected);
  const [tokenOpen, setTokenOpen] = useState(!connected);
  const [pending, setPending] = useState<"test" | "off" | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setConnected(connected);
    setTokenOpen(!connected);
  }, [connected, agentId]);

  async function check() {
    if (!agentId) {
      toast.error("Сначала сохраните агента.");
      return;
    }
    setPending("test");
    setResult("");
    setError("");
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountId = activeAccountHeader();
      if (accountId) headers.set("x-account-id", accountId);
      const response = await fetch(`/api/agents/${agentId}/payments/test`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ provider: "yookassa", yookassaShopId: shopId.trim(), yookassaSecretKey: secret.trim() }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; accountId?: string } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Не удалось подключиться к ЮKassa.");
        return;
      }
      const message = data.accountId ? `Подключено: магазин ${data.accountId}` : "Подключено: ЮKassa отвечает.";
      setResult(message);
      toast.success(message);
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
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountId = activeAccountHeader();
      if (accountId) headers.set("x-account-id", accountId);
      const response = await fetch(`/api/agents/${agentId}/payments`, {
        method: "DELETE",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ provider: "yookassa" }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(data?.error || "Не удалось отключить ЮKassa.");
        return;
      }
      setConnected(false);
      setTokenOpen(true);
      setResult("");
      onChange({ yookassa_secret_key: "" });
      toast.success("ЮKassa отключена");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const webhookUrl = agentId ? `https://www.strikeplatform.io/api/webhooks/payments/yookassa/${agentId}` : "";

  return (
    <IntegrationAccordionCard
      title="ЮKassa"
      description="Ссылка на оплату в рублях и автоматическое подтверждение платежа."
      connected={isConnected}
      icon={<YookassaIcon />}
    >
      <label className="grid gap-2 text-sm text-zinc-300">
        Shop ID
        <input name="yookassa_shop_id" value={shopId} onChange={(event) => onChange({ yookassa_shop_id: event.target.value })} placeholder="123456" inputMode="numeric" autoComplete="off" spellCheck={false} className={fieldClass} />
      </label>
      {tokenOpen ? (
        <label className="grid gap-2 text-sm text-zinc-300">
          Секретный ключ
          <input name="yookassa_secret_key" type="password" value={secret} onChange={(event) => onChange({ yookassa_secret_key: event.target.value })} placeholder="live_... или test_..." autoComplete="new-password" spellCheck={false} className={fieldClass} />
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!agentId || !shopId.trim() || pending !== null || (!secret.trim() && !isConnected)} onClick={() => void check()}>
          {pending === "test" ? "Проверяем..." : "Проверить подключение"}
        </Button>
        {isConnected ? (
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => setTokenOpen((current) => !current)}>Обновить ключ</Button>
            <Button type="button" variant="outline" disabled={pending === "off"} onClick={() => void disconnect()}>{pending === "off" ? "Отключаем..." : "Отключить"}</Button>
          </>
        ) : null}
      </div>
      {result ? <p className="text-sm text-emerald-400">{result}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <PaymentSetupHint>
        <li>В личном кабинете ЮKassa откройте <strong>Интеграция → Ключи API</strong>, скопируйте <strong>shopId</strong> (из шапки кабинета) и выпустите <strong>Секретный ключ</strong>.</li>
        <li>Перейдите в <strong>Интеграция → HTTP-уведомления</strong>, вставьте <strong>Webhook URL</strong> ниже и отметьте галочкой событие <code>payment.succeeded</code>.</li>
        <li>Вставьте ключи в поля выше, нажмите «Проверить подключение» и сохраните агента.</li>
      </PaymentSetupHint>
      <PaymentWebhookField url={webhookUrl} />
    </IntegrationAccordionCard>
  );
}

function ProdamusCard({
  agentId,
  connected,
  shopUrl,
  secret,
  onChange,
}: {
  agentId: string;
  connected: boolean;
  shopUrl: string;
  secret: string;
  onChange: (patch: { prodamus_shop_url?: string; prodamus_secret_key?: string }) => void;
}) {
  const router = useRouter();
  const [isConnected, setConnected] = useState(connected);
  const [tokenOpen, setTokenOpen] = useState(!connected);
  const [pending, setPending] = useState<"test" | "off" | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setConnected(connected);
    setTokenOpen(!connected);
  }, [connected, agentId]);

  async function check() {
    if (!agentId) {
      toast.error("Сначала сохраните агента.");
      return;
    }
    setPending("test");
    setResult("");
    setError("");
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountId = activeAccountHeader();
      if (accountId) headers.set("x-account-id", accountId);
      const response = await fetch(`/api/agents/${agentId}/payments/test`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ provider: "prodamus", prodamusShopUrl: shopUrl.trim(), prodamusSecretKey: secret.trim() }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Не удалось подключиться к Продамус.");
        return;
      }
      setResult("Подключено: ссылка на оплату создаётся.");
      toast.success("Продамус отвечает");
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
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountId = activeAccountHeader();
      if (accountId) headers.set("x-account-id", accountId);
      const response = await fetch(`/api/agents/${agentId}/payments`, {
        method: "DELETE",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ provider: "prodamus" }),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(data?.error || "Не удалось отключить Продамус.");
        return;
      }
      setConnected(false);
      setTokenOpen(true);
      setResult("");
      onChange({ prodamus_secret_key: "" });
      toast.success("Продамус отключён");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const webhookUrl = agentId ? `https://www.strikeplatform.io/api/webhooks/payments/prodamus/${agentId}` : "";

  return (
    <IntegrationAccordionCard
      title="Продамус (Prodamus)"
      description="Короткая ссылка payform и отметка об оплате по подписи Sign."
      connected={isConnected}
      icon={<ProdamusIcon />}
    >
      <label className="grid gap-2 text-sm text-zinc-300">
        URL платёжной страницы
        <input name="prodamus_shop_url" value={shopUrl} onChange={(event) => onChange({ prodamus_shop_url: event.target.value })} placeholder="https://myshop.payform.ru" autoComplete="off" spellCheck={false} className={fieldClass} />
      </label>
      {tokenOpen ? (
        <label className="grid gap-2 text-sm text-zinc-300">
          Секретный ключ
          <input name="prodamus_secret_key" type="password" value={secret} onChange={(event) => onChange({ prodamus_secret_key: event.target.value })} placeholder="Секретный ключ" autoComplete="new-password" spellCheck={false} className={fieldClass} />
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={!agentId || !shopUrl.trim() || pending !== null || (!secret.trim() && !isConnected)} onClick={() => void check()}>
          {pending === "test" ? "Проверяем..." : "Проверить подключение"}
        </Button>
        {isConnected ? (
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => setTokenOpen((current) => !current)}>Обновить ключ</Button>
            <Button type="button" variant="outline" disabled={pending === "off"} onClick={() => void disconnect()}>{pending === "off" ? "Отключаем..." : "Отключить"}</Button>
          </>
        ) : null}
      </div>
      {result ? <p className="text-sm text-emerald-400">{result}</p> : null}
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <PaymentSetupHint>
        <li>В личном кабинете Продамус откройте <strong>Настройки</strong> и скопируйте адрес вашей платёжной страницы (<code>https://....payform.ru</code>) и <strong>Секретный ключ</strong>.</li>
        <li>В том же разделе в поле <strong>URL для уведомлений</strong> вставьте <strong>Webhook URL</strong> ниже и сохраните настройки в Продамус.</li>
        <li>Вставьте данные в поля выше, нажмите «Проверить подключение» и сохраните агента.</li>
      </PaymentSetupHint>
      <PaymentWebhookField url={webhookUrl} />
    </IntegrationAccordionCard>
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
    <IntegrationAccordionCard
      title="Исходящий Webhook (CRM / Make / n8n)"
      description="POST-запрос на каждое сообщение диалога и смену статуса."
      connected={Boolean(url.trim())}
      icon={<WebhookIcon />}
    >
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
    </IntegrationAccordionCard>
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
    <IntegrationAccordionCard
      title="amoCRM / Kommo"
      description="Контакт, сделка и переписка в карточке."
      connected={isConnected}
      icon={<AmoCrmIcon />}
    >
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
    </IntegrationAccordionCard>
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
    <IntegrationAccordionCard
      title="Pipedrive CRM"
      description="Контакт, сделка и заметки по диалогу."
      connected={isConnected}
      icon={<PipedriveIcon />}
    >
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
    </IntegrationAccordionCard>
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
    <IntegrationAccordionCard
      title="Битрикс24 (Открытые Линии + CRM)"
      description="Лид, таймлайн и перевод на ответственного."
      connected={isConnected}
      icon={<BitrixIcon />}
    >
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
    </IntegrationAccordionCard>
  );
}

function withCurrent(items: { id: string; name: string }[], id: string, label: string) {
  if (!id || items.some((item) => item.id === id)) return items;
  return [...items, { id, name: label }];
}

function messengerReturnPending() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.has("messenger_select") || params.has("messenger_connected") || params.has("messenger_error");
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
  const [openChannelsTab] = useState(messengerReturnPending);
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
    data.set("yclients_platform", current.yclients_platform);
    data.set("yclients_company_id", current.yclients_company_id);
    if (current.yclients_partner_token) data.set("yclients_partner_token", current.yclients_partner_token);
    if (current.yclients_user_token) data.set("yclients_user_token", current.yclients_user_token);
    data.set("dikidi_booking_url", current.dikidi_booking_url);
    data.set("stripe_currency", current.stripe_currency);
    if (current.stripe_secret_key) data.set("stripe_secret_key", current.stripe_secret_key);
    if (current.stripe_webhook_secret) data.set("stripe_webhook_secret", current.stripe_webhook_secret);
    data.set("yookassa_shop_id", current.yookassa_shop_id);
    if (current.yookassa_secret_key) data.set("yookassa_secret_key", current.yookassa_secret_key);
    data.set("prodamus_shop_url", current.prodamus_shop_url);
    if (current.prodamus_secret_key) data.set("prodamus_secret_key", current.prodamus_secret_key);
    data.set("payment_success_message", current.payment_success_message);
    data.set("payment_return_url", current.payment_return_url);
    data.set("ym_counter_id", current.ym_counter_id);
    data.set("ga4_measurement_id", current.ga4_measurement_id);
    data.set("ga4_enabled", current.ga4_enabled ? "true" : "false");
    data.set("twilio_sms_enabled", current.twilio_sms_enabled ? "true" : "false");
    data.set("twilio_account_sid", current.twilio_account_sid);
    data.set("twilio_sms_number", current.twilio_sms_number);
    if (current.twilio_auth_token) data.set("twilio_auth_token", current.twilio_auth_token);
    data.set("viber_enabled", current.viber_enabled ? "true" : "false");
    data.set("viber_bot_name", current.viber_bot_name);
    if (current.viber_auth_token) data.set("viber_auth_token", current.viber_auth_token);
    data.set("email_enabled", current.email_enabled ? "true" : "false");
    data.set("email_address", current.email_address);
    data.set("email_imap_host", current.email_imap_host);
    data.set("email_imap_port", current.email_imap_port);
    data.set("email_smtp_host", current.email_smtp_host);
    data.set("email_smtp_port", current.email_smtp_port);
    if (current.email_password) data.set("email_password", current.email_password);
    data.set("fb_messenger_enabled", current.fb_messenger_enabled ? "true" : "false");
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
              <Tabs defaultValue={openChannelsTab ? "channels" : "main"} className="gap-0">
                <TabsList className="mb-6 h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900 p-1.5 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {AGENT_TABS.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="h-10 min-w-0 flex-1 whitespace-nowrap rounded-xl px-2 text-sm data-[state=inactive]:hover:bg-zinc-950 data-[state=inactive]:hover:text-white"
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
                    smsEnabled={draft.twilio_sms_enabled}
                    smsAccountSid={draft.twilio_account_sid}
                    smsAuthToken={draft.twilio_auth_token}
                    smsPhone={draft.twilio_sms_number}
                    smsSavedConnected={channelAgent?.twilioSmsConnected ?? false}
                    onSmsChange={patchDraft}
                    onEnsureSaved={ensureAgentSaved}
                    onSmsCleared={() => {
                      const cleared = {
                        twilio_sms_enabled: false,
                        twilio_account_sid: "",
                        twilio_auth_token: "",
                        twilio_sms_number: "",
                      };
                      setDraft((current) => ({ ...current, ...cleared }));
                      setBaseline((current) => ({ ...current, ...cleared }));
                    }}
                    agentName={draft.name}
                    viberEnabled={draft.viber_enabled}
                    viberAuthToken={draft.viber_auth_token}
                    viberBotName={draft.viber_bot_name}
                    viberSavedConnected={channelAgent?.viberConnected ?? false}
                    emailEnabled={draft.email_enabled}
                    emailAddress={draft.email_address}
                    emailPassword={draft.email_password}
                    emailImapHost={draft.email_imap_host}
                    emailImapPort={draft.email_imap_port}
                    emailSmtpHost={draft.email_smtp_host}
                    emailSmtpPort={draft.email_smtp_port}
                    emailSavedConnected={channelAgent?.emailConnected ?? false}
                    onViberChange={patchDraft}
                    onEmailChange={patchDraft}
                    messengerEnabled={draft.fb_messenger_enabled}
                    messengerConnected={channelAgent?.fbMessengerConnected ?? false}
                    messengerPageName={channelAgent?.fb_page_name ?? ""}
                    messengerPageId={channelAgent?.fb_page_id ?? ""}
                    onMessengerChange={patchDraft}
                    onMessengerCleared={() => {
                      setDraft((current) => ({ ...current, fb_messenger_enabled: false }));
                      setBaseline((current) => ({ ...current, fb_messenger_enabled: false }));
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
                  </div>
                </TabsContent>

                <TabsContent value="integrations" forceMount className="data-[state=inactive]:hidden">
                  <div className="grid content-start gap-6">
                    <section className="grid gap-3">
                      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">CRM-системы</h3>
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
                    </section>
                    <section className="grid gap-3">
                      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Календари и запись</h3>
                      <GoogleCalendarCard
                        agentId={persistedId}
                        connected={channelAgent?.gcalConnected ?? false}
                        timezone={channelAgent?.gcalTimezone ?? "UTC"}
                      />
                      <YclientsCard
                        agentId={persistedId}
                        connected={channelAgent?.yclientsConnected ?? false}
                        platform={draft.yclients_platform}
                        companyId={draft.yclients_company_id}
                        partnerToken={draft.yclients_partner_token}
                        userToken={draft.yclients_user_token}
                        onChange={patchDraft}
                      />
                      <DikidiCard url={draft.dikidi_booking_url} onChange={patchDraft} />
                    </section>
                    <section className="grid gap-3">
                      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Платёжные шлюзы (e-commerce)</h3>
                      <StripeCard
                        agentId={persistedId}
                        connected={channelAgent?.stripeConnected ?? false}
                        currency={draft.stripe_currency}
                        secret={draft.stripe_secret_key}
                        webhookSecret={draft.stripe_webhook_secret}
                        onChange={patchDraft}
                      />
                      <YookassaCard
                        agentId={persistedId}
                        connected={channelAgent?.yookassaConnected ?? false}
                        shopId={draft.yookassa_shop_id}
                        secret={draft.yookassa_secret_key}
                        onChange={patchDraft}
                      />
                      <ProdamusCard
                        agentId={persistedId}
                        connected={channelAgent?.prodamusConnected ?? false}
                        shopUrl={draft.prodamus_shop_url}
                        secret={draft.prodamus_secret_key}
                        onChange={patchDraft}
                      />
                      <IntegrationAccordionCard
                        title="После оплаты"
                        description="Сообщение клиенту и страница, куда его вернёт шлюз."
                        connected={false}
                        showStatus={false}
                        icon={<PaymentNoticeIcon />}
                      >
                        <label className="grid gap-2 text-sm text-zinc-300">
                          Сообщение после успешной оплаты
                          <textarea
                            name="payment_success_message"
                            value={draft.payment_success_message}
                            onChange={(event) => patchDraft({ payment_success_message: event.target.value })}
                            placeholder="Оплата прошла успешно! Вот ссылка на ваш доступ: ..."
                            rows={3}
                            className={fieldClass}
                          />
                        </label>
                        <label className="grid gap-2 text-sm text-zinc-300">
                          URL возврата после оплаты
                          <input
                            name="payment_return_url"
                            value={draft.payment_return_url}
                            onChange={(event) => patchDraft({ payment_return_url: event.target.value })}
                            placeholder="https://vash-site.com/thank-you"
                            autoComplete="off"
                            spellCheck={false}
                            className={fieldClass}
                          />
                        </label>
                      </IntegrationAccordionCard>
                    </section>
                    <section className="grid gap-3">
                      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Аналитика и реклама</h3>
                      <YandexMetrikaCard counterId={draft.ym_counter_id} onChange={patchDraft} />
                      <Ga4Card enabled={draft.ga4_enabled} measurementId={draft.ga4_measurement_id} onChange={patchDraft} />
                    </section>
                    <section className="grid gap-3">
                      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Автоматизация и API</h3>
                      <OutboundWebhookCard
                        agentId={persistedId}
                        url={draft.webhook_url}
                        secret={draft.webhook_secret}
                        onChange={patchDraft}
                      />
                    </section>
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
  yclients_platform: "yclients" | "altegio";
  yclients_company_id: string;
  yclients_partner_token: string;
  yclients_user_token: string;
  dikidi_booking_url: string;
  stripe_currency: string;
  stripe_secret_key: string;
  stripe_webhook_secret: string;
  yookassa_shop_id: string;
  yookassa_secret_key: string;
  prodamus_shop_url: string;
  prodamus_secret_key: string;
  payment_success_message: string;
  payment_return_url: string;
  ym_counter_id: string;
  ga4_measurement_id: string;
  ga4_enabled: boolean;
  twilio_sms_enabled: boolean;
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_sms_number: string;
  viber_enabled: boolean;
  viber_auth_token: string;
  viber_bot_name: string;
  email_enabled: boolean;
  email_address: string;
  email_password: string;
  email_imap_host: string;
  email_imap_port: string;
  email_smtp_host: string;
  email_smtp_port: string;
  fb_messenger_enabled: boolean;
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
    yclients_platform: agent?.yclients_platform === "altegio" ? "altegio" : "yclients",
    yclients_company_id: agent?.yclients_company_id ?? "",
    yclients_partner_token: "",
    yclients_user_token: "",
    dikidi_booking_url: agent?.dikidi_booking_url ?? "",
    stripe_currency: agent?.stripe_currency || "usd",
    stripe_secret_key: "",
    stripe_webhook_secret: "",
    yookassa_shop_id: agent?.yookassa_shop_id ?? "",
    yookassa_secret_key: "",
    prodamus_shop_url: agent?.prodamus_shop_url ?? "",
    prodamus_secret_key: "",
    payment_success_message: agent?.payment_success_message ?? "",
    payment_return_url: agent?.payment_return_url ?? "",
    ym_counter_id: agent?.ym_counter_id ?? "",
    ga4_measurement_id: agent?.ga4_measurement_id ?? "",
    ga4_enabled: agent?.ga4_enabled ?? false,
    twilio_sms_enabled: agent?.twilio_sms_enabled ?? false,
    twilio_account_sid: agent?.twilio_account_sid ?? "",
    twilio_auth_token: "",
    twilio_sms_number: agent?.twilio_sms_number ?? "",
    viber_enabled: agent?.viber_enabled ?? false,
    viber_auth_token: "",
    viber_bot_name: agent?.viber_bot_name ?? "",
    email_enabled: agent?.email_enabled ?? false,
    email_address: agent?.email_address ?? "",
    email_password: "",
    email_imap_host: agent?.email_imap_host ?? "",
    email_imap_port: String(agent?.email_imap_port ?? 993),
    email_smtp_host: agent?.email_smtp_host ?? "",
    email_smtp_port: String(agent?.email_smtp_port ?? 465),
    fb_messenger_enabled: agent?.fb_messenger_enabled ?? false,
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
    left.bitrix_handoff_status_id === right.bitrix_handoff_status_id &&
    left.yclients_platform === right.yclients_platform &&
    left.yclients_company_id.trim() === right.yclients_company_id.trim() &&
    left.yclients_partner_token === right.yclients_partner_token &&
    left.yclients_user_token === right.yclients_user_token &&
    left.dikidi_booking_url.trim() === right.dikidi_booking_url.trim() &&
    left.stripe_currency === right.stripe_currency &&
    left.stripe_secret_key === right.stripe_secret_key &&
    left.stripe_webhook_secret === right.stripe_webhook_secret &&
    left.yookassa_shop_id.trim() === right.yookassa_shop_id.trim() &&
    left.yookassa_secret_key === right.yookassa_secret_key &&
    left.prodamus_shop_url.trim() === right.prodamus_shop_url.trim() &&
    left.prodamus_secret_key === right.prodamus_secret_key &&
    left.payment_success_message.trim() === right.payment_success_message.trim() &&
    left.payment_return_url.trim() === right.payment_return_url.trim() &&
    left.ym_counter_id.trim() === right.ym_counter_id.trim() &&
    left.ga4_measurement_id.trim().toUpperCase() === right.ga4_measurement_id.trim().toUpperCase() &&
    left.ga4_enabled === right.ga4_enabled &&
    left.twilio_sms_enabled === right.twilio_sms_enabled &&
    left.twilio_account_sid.trim() === right.twilio_account_sid.trim() &&
    left.twilio_auth_token === right.twilio_auth_token &&
    left.twilio_sms_number.trim() === right.twilio_sms_number.trim() &&
    left.viber_enabled === right.viber_enabled &&
    left.viber_auth_token === right.viber_auth_token &&
    left.viber_bot_name.trim() === right.viber_bot_name.trim() &&
    left.email_enabled === right.email_enabled &&
    left.email_address.trim().toLowerCase() === right.email_address.trim().toLowerCase() &&
    left.email_password === right.email_password &&
    left.email_imap_host.trim().toLowerCase() === right.email_imap_host.trim().toLowerCase() &&
    left.email_smtp_host.trim().toLowerCase() === right.email_smtp_host.trim().toLowerCase() &&
    sameNumber(left.email_imap_port, right.email_imap_port) &&
    sameNumber(left.email_smtp_port, right.email_smtp_port) &&
    left.fb_messenger_enabled === right.fb_messenger_enabled
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
  smsEnabled,
  smsAccountSid,
  smsAuthToken,
  smsPhone,
  smsSavedConnected,
  onSmsChange,
  onEnsureSaved,
  onSmsCleared,
  agentName,
  viberEnabled,
  viberAuthToken,
  viberBotName,
  viberSavedConnected,
  emailEnabled,
  emailAddress,
  emailPassword,
  emailImapHost,
  emailImapPort,
  emailSmtpHost,
  emailSmtpPort,
  emailSavedConnected,
  onViberChange,
  onEmailChange,
  messengerEnabled,
  messengerConnected,
  messengerPageName,
  messengerPageId,
  onMessengerChange,
  onMessengerCleared,
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
  smsEnabled: boolean;
  smsAccountSid: string;
  smsAuthToken: string;
  smsPhone: string;
  smsSavedConnected: boolean;
  onSmsChange: (patch: {
    twilio_sms_enabled?: boolean;
    twilio_account_sid?: string;
    twilio_auth_token?: string;
    twilio_sms_number?: string;
  }) => void;
  onEnsureSaved: () => Promise<string | null>;
  onSmsCleared: () => void;
  agentName: string;
  viberEnabled: boolean;
  viberAuthToken: string;
  viberBotName: string;
  viberSavedConnected: boolean;
  emailEnabled: boolean;
  emailAddress: string;
  emailPassword: string;
  emailImapHost: string;
  emailImapPort: string;
  emailSmtpHost: string;
  emailSmtpPort: string;
  emailSavedConnected: boolean;
  onViberChange: (patch: { viber_enabled?: boolean; viber_auth_token?: string; viber_bot_name?: string }) => void;
  onEmailChange: (patch: {
    email_enabled?: boolean;
    email_address?: string;
    email_password?: string;
    email_imap_host?: string;
    email_imap_port?: string;
    email_smtp_host?: string;
    email_smtp_port?: string;
  }) => void;
  messengerEnabled: boolean;
  messengerConnected: boolean;
  messengerPageName: string;
  messengerPageId: string;
  onMessengerChange: (patch: { fb_messenger_enabled?: boolean }) => void;
  onMessengerCleared: () => void;
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
  const [whatsappTab, setWhatsappTab] = useState<"qr" | "twilio">("qr");

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

  const smsConnected = smsCredentialsReady(smsAccountSid, smsAuthToken, smsPhone, smsSavedConnected);
  const viberConnected = viberCredentialsReady(viberAuthToken, viberSavedConnected);
  const emailConnected = emailCredentialsReady(emailAddress, emailPassword, emailImapHost, emailSmtpHost, emailSavedConnected);

  return (
    <section className="grid content-start gap-3">
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
      <ChannelAccordionCard
        title="WhatsApp"
        description="Подключение рабочего номера по QR-коду за 30 секунд или через Twilio API"
        connected={whatsappConnected}
        icon={<ChannelIcon provider="whatsapp" className="size-4" />}
        enabled={whatsappConnected && channels.whatsapp}
        switchDisabled={!whatsappConnected}
        switchTitle={whatsappConnected ? undefined : "Сначала подключите номер WhatsApp"}
        defaultOpen={initialOpenChannel === "whatsapp"}
        onEnabledChange={(checked) => onChannelsChange({ ...channels, whatsapp: checked })}
      >
        {whatsappConnected && channels.whatsapp ? (
          <ChannelDelay value={delays.whatsapp} onChange={(whatsapp) => onDelaysChange({ ...delays, whatsapp })} />
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={`${whatsappTab === "qr" ? platformTabActive : platformTabIdle} text-center leading-tight`} onClick={() => setWhatsappTab("qr")}>
            По QR-коду (Рекомендуем)
          </button>
          <button type="button" className={`${whatsappTab === "twilio" ? platformTabActive : platformTabIdle} text-center leading-tight`} onClick={() => setWhatsappTab("twilio")}>
            Официальный API (Twilio)
          </button>
        </div>
        <div hidden={whatsappTab !== "qr"}>
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
        <div hidden={whatsappTab !== "twilio"}>
          <TwilioConnectCard embedded />
        </div>
      </ChannelAccordionCard>
      <ChannelAccordionCard
        title="Telegram"
        description="Telegram-бот через BotFather или личный аккаунт"
        connected={telegramConnected}
        icon={<ChannelIcon provider="telegram" className="size-4" />}
        enabled={telegramConnected && channels.telegram}
        switchDisabled={!telegramConnected}
        switchTitle={telegramConnected ? undefined : "Сначала подключите Telegram"}
        defaultOpen={initialOpenChannel === "telegram"}
        onEnabledChange={(checked) => onChannelsChange({ ...channels, telegram: checked })}
      >
        {telegramConnected && channels.telegram ? (
          <ChannelDelay value={delays.telegram} onChange={(telegram) => onDelaysChange({ ...delays, telegram })} />
        ) : null}
        <TelegramChannel agent={agent} connecting={connectingChannel === "telegram"} onConnect={() => void handleConnect("telegram")} />
      </ChannelAccordionCard>
      <ChannelAccordionCard
        title="Instagram"
        description="Прямые сообщения Direct и ответы через официальный API Meta"
        connected={instagramConnected}
        icon={<ChannelIcon provider="instagram" className="size-4" />}
        enabled={instagramConnected && channels.instagram}
        switchDisabled={!instagramConnected}
        switchTitle={instagramConnected ? undefined : "Сначала подключите Instagram"}
        onEnabledChange={(checked) => onChannelsChange({ ...channels, instagram: checked })}
      >
        {instagramConnected && channels.instagram ? (
          <ChannelDelay value={delays.instagram} onChange={(instagram) => onDelaysChange({ ...delays, instagram })} />
        ) : null}
        <InstagramChannel agent={agent} connecting={instagramConnecting} onConnect={() => void handleInstagramConnect()} />
        <Suspense fallback={null}>
          <InstagramNotice connected={instagramConnected} />
        </Suspense>
      </ChannelAccordionCard>
      <ChannelAccordionCard
        title="Web Widget"
        description="Чат-виджет для вашего сайта с поддержкой Метрики и GA4"
        connected={channels.widget}
        icon={<Globe className="size-4" strokeWidth={2} />}
        enabled={channels.widget}
        defaultOpen={initialOpenChannel === "widget"}
        onEnabledChange={(checked) => onChannelsChange({ ...channels, widget: checked })}
      >
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
      </ChannelAccordionCard>
      <ChannelAccordionCard
        title="SMS (Twilio)"
        description="Автоответы на входящие SMS и пропущенные звонки через Twilio"
        connected={smsConnected}
        icon={<MessageSquareText className="size-4" strokeWidth={2} />}
        enabled={smsConnected && smsEnabled}
        switchDisabled={!smsConnected}
        switchTitle={smsConnected ? undefined : "Сначала укажите Account SID, Auth Token и номер"}
        onEnabledChange={(checked) => onSmsChange({ twilio_sms_enabled: checked })}
      >
        <SmsChannelFields
          agentId={agentId}
          enabled={smsEnabled}
          accountSid={smsAccountSid}
          authToken={smsAuthToken}
          phone={smsPhone}
          savedConnected={smsSavedConnected}
          onChange={onSmsChange}
          onCleared={onSmsCleared}
          onEnsureSaved={onEnsureSaved}
        />
      </ChannelAccordionCard>
      <ChannelAccordionCard
        title="Viber"
        description="Автоответы клиентам в официальном Viber-боте"
        connected={viberConnected}
        icon={<ChannelIcon provider="viber" className="size-4" />}
        enabled={viberConnected && viberEnabled}
        switchDisabled={!viberConnected}
        switchTitle={viberConnected ? undefined : "Сначала укажите Auth Token"}
        onEnabledChange={(checked) => onViberChange({ viber_enabled: checked })}
      >
        <ViberChannelFields
          agentId={agentId}
          agentName={agentName}
          enabled={viberEnabled}
          authToken={viberAuthToken}
          botName={viberBotName}
          savedConnected={viberSavedConnected}
          onChange={onViberChange}
          onEnsureSaved={onEnsureSaved}
        />
      </ChannelAccordionCard>
      <ChannelAccordionCard
        title="Email (IMAP / SMTP)"
        description="Автоматическое чтение входящих писем и ответы клиентам прямо в почтовой ветке"
        connected={emailConnected}
        icon={<Mail className="size-4" strokeWidth={2} />}
        enabled={emailConnected && emailEnabled}
        switchDisabled={!emailConnected}
        switchTitle={emailConnected ? undefined : "Сначала укажите почту, пароль и хосты"}
        onEnabledChange={(checked) => onEmailChange({ email_enabled: checked })}
      >
        <EmailChannelFields
          agentId={agentId}
          enabled={emailEnabled}
          address={emailAddress}
          password={emailPassword}
          imapHost={emailImapHost}
          imapPort={emailImapPort}
          smtpHost={emailSmtpHost}
          smtpPort={emailSmtpPort}
          savedConnected={emailSavedConnected}
          onChange={onEmailChange}
          onEnsureSaved={onEnsureSaved}
        />
      </ChannelAccordionCard>
      <ChannelAccordionCard
        title="Facebook Messenger"
        description="Автоответы на сообщения вашей бизнес-страницы Facebook через официальный API Meta"
        connected={messengerConnected}
        icon={<ChannelIcon provider="messenger" className="size-4" />}
        enabled={messengerConnected && messengerEnabled}
        switchDisabled={!messengerConnected}
        switchTitle={messengerConnected ? undefined : "Сначала подключите страницу Facebook"}
        defaultOpen={messengerReturnPending()}
        onEnabledChange={(checked) => onMessengerChange({ fb_messenger_enabled: checked })}
      >
        <MessengerChannelFields
          agentId={agentId}
          enabled={messengerEnabled}
          connected={messengerConnected}
          pageName={messengerPageName}
          pageId={messengerPageId}
          onChange={onMessengerChange}
          onCleared={onMessengerCleared}
          onEnsureSaved={onEnsureSaved}
        />
      </ChannelAccordionCard>
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

function viberCredentialsReady(authToken: string, savedConnected: boolean) {
  const token = authToken.trim();
  return savedConnected || (token.length >= 20 && !/\s/.test(authToken));
}

function emailCredentialsReady(address: string, password: string, imapHost: string, smtpHost: string, savedConnected: boolean) {
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.trim());
  const hostsOk = Boolean(imapHost.trim() && smtpHost.trim());
  const passwordOk = password.trim().length > 0 || savedConnected;
  return emailOk && hostsOk && passwordOk;
}

const MAIL_PRESETS = {
  gmail: { imap: "imap.gmail.com", smtp: "smtp.gmail.com" },
  yandex: { imap: "imap.yandex.com", smtp: "smtp.yandex.com" },
  mailru: { imap: "imap.mail.ru", smtp: "smtp.mail.ru" },
} as const;

function ViberChannelFields({
  agentId,
  agentName,
  enabled,
  authToken,
  botName,
  savedConnected,
  onChange,
  onEnsureSaved,
}: {
  agentId: string;
  agentName: string;
  enabled: boolean;
  authToken: string;
  botName: string;
  savedConnected: boolean;
  onChange: (patch: { viber_enabled?: boolean; viber_auth_token?: string; viber_bot_name?: string }) => void;
  onEnsureSaved: () => Promise<string | null>;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const webhookUrl = agentId ? `https://www.strikeplatform.io/api/webhooks/viber/${agentId}` : "";
  const ready = viberCredentialsReady(authToken, savedConnected);

  function patch(next: { viber_auth_token?: string; viber_bot_name?: string }) {
    const token = next.viber_auth_token ?? authToken;
    const stillReady = viberCredentialsReady(token, savedConnected);
    onChange(stillReady ? next : { ...next, viber_enabled: false });
  }

  async function copyWebhook() {
    if (!webhookUrl) {
      toast.error("Сначала сохраните агента.");
      return;
    }
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Webhook URL скопирован");
    } catch {
      toast.error("Не удалось скопировать адрес.");
    }
  }

  async function connect() {
    setPending(true);
    setResult("");
    setError("");
    try {
      const id = agentId || (await onEnsureSaved());
      if (!id) return;
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountHeader = activeAccountHeader();
      if (accountHeader) headers.set("x-account-id", accountHeader);
      const response = await fetch(`/api/agents/${id}/viber/connect`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ authToken, botName }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Viber не принял вебхук.");
        return;
      }
      setResult("Вебхук зарегистрирован в Viber.");
      toast.success("Viber подключён");
      void swrMutate("/api/agents");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Сеть недоступна");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <input type="hidden" name="viber_enabled" value={ready && enabled ? "true" : "false"} />
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Auth Token
        <input
          name="viber_auth_token"
          type="password"
          value={authToken}
          autoComplete="new-password"
          spellCheck={false}
          placeholder={savedConnected ? "Токен сохранён. Введите новый, чтобы заменить." : ""}
          className={fieldClass}
          onChange={(event) => patch({ viber_auth_token: event.target.value })}
        />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Имя бота в чате
        <input
          name="viber_bot_name"
          value={botName}
          autoComplete="off"
          placeholder={agentName.trim() || "Имя агента"}
          className={fieldClass}
          onChange={(event) => patch({ viber_bot_name: event.target.value })}
        />
      </label>
      <Button type="button" variant="outline" disabled={pending} onClick={() => void connect()}>
        {pending ? "Подключаем..." : "Подключить и проверить"}
      </Button>
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Webhook URL
        <span className="flex gap-2">
          <input readOnly value={webhookUrl} placeholder="Появится после сохранения агента" className={fieldClass} />
          <Button type="button" variant="outline" onClick={() => void copyWebhook()}>
            Скопировать
          </Button>
        </span>
      </label>
      {result ? <p className="text-xs text-emerald-400">{result}</p> : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <PaymentSetupHint>
        <li>
          Создайте бота в <strong>Viber Admin Panel</strong> (<code>partners.viber.com</code>) и скопируйте <strong>Auth Token</strong>.
        </li>
        <li>
          Вставьте токен в поле выше и нажмите <strong>«Подключить и проверить»</strong> — STRIKE сам настроит вебхук.
        </li>
        <li>Включите тумблер канала и сохраните агента.</li>
      </PaymentSetupHint>
    </div>
  );
}

function EmailChannelFields({
  agentId,
  enabled,
  address,
  password,
  imapHost,
  imapPort,
  smtpHost,
  smtpPort,
  savedConnected,
  onChange,
  onEnsureSaved,
}: {
  agentId: string;
  enabled: boolean;
  address: string;
  password: string;
  imapHost: string;
  imapPort: string;
  smtpHost: string;
  smtpPort: string;
  savedConnected: boolean;
  onChange: (patch: {
    email_enabled?: boolean;
    email_address?: string;
    email_password?: string;
    email_imap_host?: string;
    email_imap_port?: string;
    email_smtp_host?: string;
    email_smtp_port?: string;
  }) => void;
  onEnsureSaved: () => Promise<string | null>;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const ready = emailCredentialsReady(address, password, imapHost, smtpHost, savedConnected);

  function patch(next: {
    email_address?: string;
    email_password?: string;
    email_imap_host?: string;
    email_imap_port?: string;
    email_smtp_host?: string;
    email_smtp_port?: string;
  }) {
    const stillReady = emailCredentialsReady(
      next.email_address ?? address,
      next.email_password ?? password,
      next.email_imap_host ?? imapHost,
      next.email_smtp_host ?? smtpHost,
      savedConnected,
    );
    onChange(stillReady ? next : { ...next, email_enabled: false });
  }

  function applyPreset(preset: keyof typeof MAIL_PRESETS | "custom") {
    if (preset === "custom") {
      patch({ email_imap_host: "", email_imap_port: "993", email_smtp_host: "", email_smtp_port: "465" });
      return;
    }
    const hosts = MAIL_PRESETS[preset];
    patch({ email_imap_host: hosts.imap, email_imap_port: "993", email_smtp_host: hosts.smtp, email_smtp_port: "465" });
  }

  async function check() {
    setPending(true);
    setResult("");
    setError("");
    try {
      const id = agentId || (await onEnsureSaved());
      if (!id) return;
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountHeader = activeAccountHeader();
      if (accountHeader) headers.set("x-account-id", accountHeader);
      const response = await fetch(`/api/agents/${id}/email/test`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ email: address, password, imapHost, imapPort, smtpHost, smtpPort }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Не удалось подключиться к почте.");
        return;
      }
      setResult("IMAP и SMTP отвечают.");
      toast.success("Почта подключена");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Сеть недоступна");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-4">
      <input type="hidden" name="email_enabled" value={ready && enabled ? "true" : "false"} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={platformTabIdle} onClick={() => applyPreset("gmail")}>
          Gmail
        </button>
        <button type="button" className={platformTabIdle} onClick={() => applyPreset("yandex")}>
          Yandex
        </button>
        <button type="button" className={platformTabIdle} onClick={() => applyPreset("mailru")}>
          Mail.ru
        </button>
        <button type="button" className={platformTabIdle} onClick={() => applyPreset("custom")}>
          Свой сервер
        </button>
      </div>
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Email адрес
        <input
          name="email_address"
          type="email"
          value={address}
          autoComplete="off"
          spellCheck={false}
          placeholder="agent@company.com"
          className={fieldClass}
          onChange={(event) => patch({ email_address: event.target.value })}
        />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Пароль приложения
        <input
          name="email_password"
          type="password"
          value={password}
          autoComplete="new-password"
          spellCheck={false}
          placeholder={savedConnected ? "Пароль сохранён. Введите новый, чтобы заменить." : ""}
          className={fieldClass}
          onChange={(event) => patch({ email_password: event.target.value })}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
          IMAP хост
          <input name="email_imap_host" value={imapHost} autoComplete="off" spellCheck={false} className={fieldClass} onChange={(event) => patch({ email_imap_host: event.target.value })} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
          Порт
          <input name="email_imap_port" inputMode="numeric" value={imapPort} autoComplete="off" className={fieldClass} onChange={(event) => patch({ email_imap_port: event.target.value })} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
          SMTP хост
          <input name="email_smtp_host" value={smtpHost} autoComplete="off" spellCheck={false} className={fieldClass} onChange={(event) => patch({ email_smtp_host: event.target.value })} />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
          Порт
          <input name="email_smtp_port" inputMode="numeric" value={smtpPort} autoComplete="off" className={fieldClass} onChange={(event) => patch({ email_smtp_port: event.target.value })} />
        </label>
      </div>
      <Button type="button" variant="outline" disabled={pending} onClick={() => void check()}>
        {pending ? "Проверяем..." : "Проверить подключение"}
      </Button>
      {result ? <p className="text-xs text-emerald-400">{result}</p> : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <PaymentSetupHint>
        <li>
          Для Gmail, Яндекс и Mail.ru используйте не основной пароль, а <strong>Пароль приложения</strong> (создаётся в настройках безопасности почты) и включите доступ по <strong>IMAP</strong>.
        </li>
        <li>Выберите пресет почтового сервиса выше или введите IMAP/SMTP хосты вручную.</li>
        <li>
          Нажмите <strong>«Проверить подключение»</strong>, включите тумблер и сохраните агента (бот будет отвечать только на новые письма, старую переписку не тронет).
        </li>
      </PaymentSetupHint>
    </div>
  );
}

function MessengerChannelFields({
  agentId,
  enabled,
  connected,
  pageName,
  pageId,
  onChange,
  onCleared,
  onEnsureSaved,
}: {
  agentId: string;
  enabled: boolean;
  connected: boolean;
  pageName: string;
  pageId: string;
  onChange: (patch: { fb_messenger_enabled?: boolean }) => void;
  onCleared: () => void;
  onEnsureSaved: () => Promise<string | null>;
}) {
  const router = useRouter();
  const [pages, setPages] = useState<Array<{ id: string; name: string }>>([]);
  const [pending, setPending] = useState<"page" | "off" | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState({ select: false, error: "", connectedFlag: "" });
  const notice = messengerNotice(query.error, query.connectedFlag, connected);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery({
      select: params.get("messenger_select") === "1",
      error: params.get("messenger_error") ?? "",
      connectedFlag: params.get("messenger_connected") ?? "",
    });
  }, []);
  const webhookUrl = "https://www.strikeplatform.io/api/webhooks/messenger";

  useEffect(() => {
    if (!query.select || !agentId) return;
    const headers = new Headers();
    const accountHeader = activeAccountHeader();
    if (accountHeader) headers.set("x-account-id", accountHeader);
    void fetch(`/api/agents/${agentId}/messenger/pages`, { credentials: "same-origin", headers })
      .then((response) => response.json())
      .then((data: { pages?: Array<{ id: string; name: string }> }) => setPages(Array.isArray(data.pages) ? data.pages : []))
      .catch(() => setPages([]));
  }, [agentId, query.select]);

  async function connect() {
    const id = agentId || (await onEnsureSaved());
    if (!id) return;
    window.location.assign(`/api/integrations/messenger/connect?agentId=${encodeURIComponent(id)}`);
  }

  async function choose(page: string) {
    if (!agentId) return;
    setPending("page");
    setError("");
    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountHeader = activeAccountHeader();
      if (accountHeader) headers.set("x-account-id", accountHeader);
      const response = await fetch(`/api/agents/${agentId}/messenger/select-page`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ pageId: page }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Не удалось подключить страницу.");
        return;
      }
      onChange({ fb_messenger_enabled: true });
      toast.success("Facebook-страница подключена");
      void swrMutate("/api/agents");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Сеть недоступна");
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    if (!agentId) {
      onCleared();
      return;
    }
    setPending("off");
    setError("");
    try {
      const headers = new Headers();
      const accountHeader = activeAccountHeader();
      if (accountHeader) headers.set("x-account-id", accountHeader);
      const response = await fetch(`/api/agents/${agentId}/messenger/disconnect`, {
        method: "POST",
        credentials: "same-origin",
        headers,
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Не удалось отключить Messenger.");
        return;
      }
      onCleared();
      toast.success("Messenger отключён");
      void swrMutate("/api/agents");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Сеть недоступна");
    } finally {
      setPending(null);
    }
  }

  async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Webhook URL скопирован");
    } catch {
      toast.error("Не удалось скопировать адрес.");
    }
  }

  return (
    <div className="grid gap-4">
      <input type="hidden" name="fb_messenger_enabled" value={connected && enabled ? "true" : "false"} />
      {notice ? <p className={`text-xs ${notice.ok ? "text-emerald-400" : "text-red-400"}`}>{notice.text}</p> : null}
      {connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{pageName || "Facebook-страница"}</p>
            <p className="truncate text-xs text-zinc-400">{pageId}</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void connect()}>
              Сменить страницу
            </Button>
            <Button type="button" variant="outline" disabled={pending === "off"} onClick={() => void disconnect()}>
              {pending === "off" ? "Отключаем..." : "Отключить"}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" className="bg-strike text-white hover:bg-strike/90" disabled={pending !== null} onClick={() => void connect()}>
          Подключить через Facebook
        </Button>
      )}
      {query.select && !connected ? (
        pages.length > 0 ? (
          <ul className="grid gap-2">
            {pages.map((page) => (
              <li key={page.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black px-3 py-2">
                <span className="min-w-0 truncate text-sm text-white">{page.name}</span>
                <Button type="button" variant="outline" disabled={pending === "page"} onClick={() => void choose(page.id)}>
                  Выбрать
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-zinc-400">Список страниц устарел. Нажмите «Подключить через Facebook» ещё раз.</p>
        )
      ) : null}
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Webhook URL
        <span className="flex gap-2">
          <input readOnly value={webhookUrl} className={fieldClass} />
          <Button type="button" variant="outline" onClick={() => void copyWebhook()}>
            Скопировать
          </Button>
        </span>
      </label>
      <PaymentSetupHint>
        <li>
          Нажмите <strong>«Подключить через Facebook»</strong> и войдите в аккаунт администратора вашей бизнес-страницы.
        </li>
        <li>Выберите нужные Facebook-страницы и подтвердите доступ к сообщениям и к Business Suite.</li>
        <li>Включите тумблер канала и сохраните агента — при ответе менеджера из Meta Business Suite бот автоматически встанет на паузу.</li>
      </PaymentSetupHint>
    </div>
  );
}

function messengerNotice(error: string | null, connectedFlag: string | null, connected: boolean) {
  if (error === "no_pages") return { ok: false, text: "У этого аккаунта Facebook нет страниц, которыми можно управлять." };
  if (error && !connected) return { ok: false, text: error };
  if (connected && connectedFlag === "1") return { ok: true, text: "Facebook-страница подключена." };
  return null;
}

function smsCredentialsReady(accountSid: string, authToken: string, phone: string, savedConnected: boolean) {
  const sidOk = /^AC[0-9a-fA-F]{32}$/.test(accountSid.trim());
  const phoneOk = /^\+\d{10,15}$/.test(phone.trim().replace(/[\s()-]/g, ""));
  const tokenOk = authToken.trim().length >= 16 || savedConnected;
  return sidOk && phoneOk && tokenOk;
}

function SmsChannelFields({
  agentId,
  enabled,
  accountSid,
  authToken,
  phone,
  savedConnected,
  onChange,
  onCleared,
  onEnsureSaved,
}: {
  agentId: string;
  enabled: boolean;
  accountSid: string;
  authToken: string;
  phone: string;
  savedConnected: boolean;
  onChange: (patch: {
    twilio_sms_enabled?: boolean;
    twilio_account_sid?: string;
    twilio_auth_token?: string;
    twilio_sms_number?: string;
  }) => void;
  onCleared: () => void;
  onEnsureSaved: () => Promise<string | null>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"test" | "off" | null>(null);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const webhookUrl = agentId ? `https://www.strikeplatform.io/api/webhooks/twilio/sms/${agentId}` : "";
  const ready = smsCredentialsReady(accountSid, authToken, phone, savedConnected);

  function patch(next: { twilio_account_sid?: string; twilio_auth_token?: string; twilio_sms_number?: string }) {
    const sid = next.twilio_account_sid ?? accountSid;
    const token = next.twilio_auth_token ?? authToken;
    const number = next.twilio_sms_number ?? phone;
    const stillReady = smsCredentialsReady(sid, token, number, savedConnected);
    onChange(stillReady ? next : { ...next, twilio_sms_enabled: false });
  }

  async function copyWebhook() {
    if (!webhookUrl) {
      toast.error("Сначала сохраните агента.");
      return;
    }
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Webhook URL скопирован");
    } catch {
      toast.error("Не удалось скопировать адрес.");
    }
  }

  async function check() {
    setPending("test");
    setResult("");
    setError("");
    try {
      const id = agentId || (await onEnsureSaved());
      if (!id) return;
      const headers = new Headers({ "Content-Type": "application/json" });
      const accountHeader = activeAccountHeader();
      if (accountHeader) headers.set("x-account-id", accountHeader);
      const response = await fetch(`/api/agents/${id}/twilio-sms/test`, {
        method: "POST",
        credentials: "same-origin",
        headers,
        body: JSON.stringify({ accountSid, authToken, phoneNumber: phone }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; friendlyName?: string } | null;
      if (!response.ok || !data?.ok) {
        setError(data?.error || "Не удалось подключиться к Twilio.");
        return;
      }
      const message = data.friendlyName ? `Подключено: ${data.friendlyName}` : "Twilio отвечает.";
      setResult(message);
      toast.success(message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Сеть недоступна");
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    if (!agentId) {
      onCleared();
      return;
    }
    setPending("off");
    setError("");
    try {
      const headers = new Headers();
      const accountHeader = activeAccountHeader();
      if (accountHeader) headers.set("x-account-id", accountHeader);
      const response = await fetch(`/api/agents/${agentId}/twilio-sms`, {
        method: "DELETE",
        credentials: "same-origin",
        headers,
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setError(data?.error || "Не удалось отключить SMS.");
        return;
      }
      onCleared();
      toast.success("SMS отключён");
      void swrMutate("/api/agents");
      router.refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Сеть недоступна");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid gap-4">
      <input type="hidden" name="twilio_sms_enabled" value={ready && enabled ? "true" : "false"} />
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Account SID
        <input
          name="twilio_account_sid"
          value={accountSid}
          autoComplete="off"
          spellCheck={false}
          placeholder="AC..."
          className={fieldClass}
          onChange={(event) => patch({ twilio_account_sid: event.target.value })}
        />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Auth Token
        <input
          name="twilio_auth_token"
          type="password"
          value={authToken}
          autoComplete="new-password"
          spellCheck={false}
          placeholder={savedConnected ? "Токен сохранён. Введите новый, чтобы заменить." : ""}
          className={fieldClass}
          onChange={(event) => patch({ twilio_auth_token: event.target.value })}
        />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
        Номер Twilio
        <input
          name="twilio_sms_number"
          inputMode="tel"
          value={phone}
          autoComplete="off"
          placeholder="+14155550199"
          className={fieldClass}
          onChange={(event) => patch({ twilio_sms_number: event.target.value })}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" disabled={pending !== null} onClick={() => void check()}>
          {pending === "test" ? "Проверяем..." : "Проверить подключение"}
        </Button>
        {savedConnected ? (
          <Button type="button" variant="outline" disabled={pending === "off"} onClick={() => void disconnect()}>
            {pending === "off" ? "Отключаем..." : "Отключить"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {result ? <p className="text-sm text-zinc-300">{result}</p> : null}
      <div className="grid gap-1.5">
        <p className="text-xs font-medium text-zinc-400">Webhook URL</p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={webhookUrl || "Сохраните агента, чтобы получить Webhook URL"}
            className={fieldClass}
            aria-label="Webhook URL"
          />
          <button type="button" className="shrink-0 rounded-xl border border-zinc-700 px-3 py-3 text-sm font-medium text-white" onClick={() => void copyWebhook()}>
            Скопировать
          </button>
        </div>
      </div>
      <PaymentSetupHint title="Как подключить за 2 минуты">
        <li>
          В консоли Twilio скопируйте <strong>Account SID</strong> и <strong>Auth Token</strong> с главной страницы.
        </li>
        <li>
          Перейдите в <strong>Phone Numbers → Manage → Active numbers</strong> и откройте ваш SMS-номер.
        </li>
        <li>
          В блоке <strong>Messaging Configuration → A message comes in</strong> выберите <strong>Webhook</strong>, вставьте <strong>Webhook URL</strong> выше (метод <code>HTTP POST</code>) и нажмите <strong>Save</strong>.
        </li>
      </PaymentSetupHint>
    </div>
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