"use client";

import { Maximize, Play, Trash } from "lucide-react";
import { startTransition, useActionState, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteAgent, saveAgent, type SaveState } from "@/app/agents/actions";
import { connectTelegram, disconnectTelegram, disconnectWhatsApp } from "@/app/agents/channels";
import { ChannelIcon } from "@/components/channel-icons";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
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
  HANDOFF_DURATIONS,
  type ActiveChannels,
  type AgentRecord,
  type HandoffDuration,
} from "@/lib/agent-models";
import type { IntegrationProvider } from "@/lib/integration-catalog";

type GreenDefaults = {
  instanceId: string;
  apiToken: string;
};

const fieldClass =
  "w-full rounded-xl border border-transparent bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 hover:bg-zinc-100/80 focus:border-zinc-300 focus:bg-white";

const initialState: SaveState = { ok: false, error: null, savedId: null, attemptId: null };

export function AgentManager({
  agents,
  greenDefaults,
  loadError,
}: {
  agents: AgentRecord[];
  greenDefaults: GreenDefaults;
  loadError: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AgentRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [state, action, pending] = useActionState(saveAgent, initialState);

  useEffect(() => {
    if (!state.attemptId) return;
    const host = window as Window & {
      __strikeToasts?: Array<{ id: string; kind: "success" | "error"; message: string; expiresAt: number }>;
    };
    const item = {
      id: crypto.randomUUID(),
      kind: state.ok ? ("success" as const) : ("error" as const),
      message: state.ok ? "Настройки агента сохранены" : "Ошибка при сохранении",
      expiresAt: Date.now() + 4000,
    };
    host.__strikeToasts = [...(host.__strikeToasts ?? []), item];
    window.dispatchEvent(new CustomEvent("strike-toast"));
    window.setTimeout(() => {
      host.__strikeToasts = (host.__strikeToasts ?? []).filter((entry) => entry.id !== item.id);
      window.dispatchEvent(new CustomEvent("strike-toast"));
    }, 4000);
  }, [state.attemptId, state.ok]);

  useEffect(() => {
    if (!state.savedId) return;
    setEditing(null);
    setDialogOpen(false);
    router.refresh();
  }, [state.savedId, router]);

  useEffect(() => {
    setEditing((current) => {
      if (!current) return current;
      const fresh = agents.find((agent) => agent.id === current.id);
      if (!fresh) return current;
      if (
        fresh.waPhoneNumber === current.waPhoneNumber &&
        fresh.tgBotUsername === current.tgBotUsername &&
        fresh.waIsActive === current.waIsActive &&
        fresh.tgIsActive === current.tgIsActive
      ) {
        return current;
      }
      return fresh;
    });
  }, [agents]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(agent: AgentRecord) {
    setEditing(agent);
    setDialogOpen(true);
  }

  function closeDialog() {
    if (pending) return;
    setDialogOpen(false);
    setEditing(null);
  }

  return (
    <div>
      {loadError ? (
        <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Список агентов</h2>
        <Button type="button" onClick={openCreate}>
          + Создать агента
        </Button>
      </div>

      {agents.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-zinc-200/80 bg-white px-6 py-10 text-sm text-zinc-500 shadow-sm">
          Агентов пока нет. Создайте первого, чтобы подключить канал или открыть симулятор.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-xl font-semibold tracking-tight text-zinc-900">{agent.name}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-widest text-zinc-400">{agent.model}</p>
                  <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-500">
                    {agent.system_prompt}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={`/playground?agent=${agent.id}`} aria-label={`Тестировать агента ${agent.name}`}>
                      <Play className="size-4" strokeWidth={2} />
                      Тестировать
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" onClick={() => openEdit(agent)}>
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
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialogOpen ? (
        <AgentDialog
          key={editing?.id ?? "new"}
          editing={editing}
          action={action}
          pending={pending}
          error={state.error}
          greenDefaults={greenDefaults}
          onClose={closeDialog}
        />
      ) : null}
    </div>
  );
}

function AgentDialog({
  editing,
  action,
  pending,
  error,
  greenDefaults,
  onClose,
}: {
  editing: AgentRecord | null;
  action: (payload: FormData) => void;
  pending: boolean;
  error: string | null;
  greenDefaults: GreenDefaults;
  onClose: () => void;
}) {
  const [initialDraft] = useState(() => draftFromAgent(editing));
  const [draft, setDraft] = useState(initialDraft);
  const dirty = !sameDraft(draft, initialDraft);

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

  return (
    <div className="fixed inset-0 z-[60]">
      <DialogContent aria-labelledby="agent-dialog-title" className="flex flex-col overflow-hidden">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (!dirty || pending) return;
            const data = new FormData(event.currentTarget);
            startTransition(() => {
              action(data);
            });
          }}
        >
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 bg-white px-6 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Агент</p>
              <h2 id="agent-dialog-title" className="text-2xl font-semibold">
                {editing ? "Правка агента" : "Новый агент"}
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
            <div className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-2">
              <section className="grid content-start gap-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
                {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

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
                  <select
                    className={fieldClass}
                    name="model"
                    value={draft.model}
                    onChange={(event) => patchDraft({ model: event.target.value })}
                  >
                    {AGENT_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.value} ({model.label})
                      </option>
                    ))}
                  </select>
                </label>

                <CreativityField
                  value={draft.temperature}
                  onChange={(temperature) => patchDraft({ temperature })}
                />

                <SystemPromptField
                  value={draft.system_prompt}
                  onChange={(system_prompt) => patchDraft({ system_prompt })}
                />

                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </section>

              <div className="grid content-start gap-6">
                <ChannelSettings
                  agent={editing}
                  credentials={{ instanceId: draft.wa_instance_id, apiToken: draft.wa_api_token }}
                  greenDefaults={greenDefaults}
                  channels={draft.active_channels}
                  onChannelsChange={(active_channels) => patchDraft({ active_channels })}
                  onWhatsAppCredentials={(credentials) =>
                    patchDraft({
                      wa_instance_id: credentials.instanceId,
                      wa_api_token: credentials.apiToken,
                    })
                  }
                />
                <ResponseDelayField
                  value={draft.response_delay}
                  onChange={(response_delay) => patchDraft({ response_delay })}
                />
                <HumanHandoffField
                  value={draft.human_handoff_duration}
                  onChange={(human_handoff_duration) => patchDraft({ human_handoff_duration })}
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
              </div>
            </div>
          </div>
        </form>
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
  response_delay: string;
  human_handoff_duration: HandoffDuration;
  limit_agent_messages: string;
  limit_client_messages: string;
  limit_total_messages: string;
  split_messages: boolean;
  wa_instance_id: string;
  wa_api_token: string;
};

function draftFromAgent(agent: AgentRecord | null): AgentDraft {
  return {
    name: agent?.name ?? "",
    model: agent?.model ?? "gpt-4o-mini",
    temperature: String(agent?.temperature ?? 0.7),
    system_prompt: agent?.system_prompt ?? "",
    active_channels: { ...(agent?.active_channels ?? DEFAULT_ACTIVE_CHANNELS) },
    response_delay: String(agent?.response_delay ?? 0),
    human_handoff_duration: agent?.human_handoff_duration ?? "1_hour",
    limit_agent_messages: String(agent?.limit_agent_messages ?? 0),
    limit_client_messages: String(agent?.limit_client_messages ?? 0),
    limit_total_messages: String(agent?.limit_total_messages ?? 0),
    split_messages: agent?.split_messages ?? false,
    wa_instance_id: agent?.waInstanceId ?? "",
    wa_api_token: agent?.waApiToken ?? "",
  };
}

function sameDraft(left: AgentDraft, right: AgentDraft) {
  return (
    left.name === right.name &&
    left.model === right.model &&
    left.system_prompt === right.system_prompt &&
    left.human_handoff_duration === right.human_handoff_duration &&
    left.split_messages === right.split_messages &&
    sameNumber(left.temperature, right.temperature) &&
    sameNumber(left.response_delay, right.response_delay) &&
    sameNumber(left.limit_agent_messages, right.limit_agent_messages) &&
    sameNumber(left.limit_client_messages, right.limit_client_messages) &&
    sameNumber(left.limit_total_messages, right.limit_total_messages) &&
    left.active_channels.whatsapp === right.active_channels.whatsapp &&
    left.active_channels.telegram === right.active_channels.telegram &&
    left.active_channels.instagram === right.active_channels.instagram &&
    left.wa_instance_id === right.wa_instance_id &&
    left.wa_api_token === right.wa_api_token
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

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          Системная инструкция <span className="text-red-600">#ROLE</span>
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
        className={`${fieldClass} min-h-80 resize-y`}
        name="system_prompt"
        required
        value={value}
        placeholder={promptPlaceholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {open ? (
        <SystemPromptDialog value={value} onChange={onChange} onClose={() => setOpen(false)} />
      ) : null}
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
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-channel-dialog=""
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-prompt-title"
        className="flex h-[90vh] w-[90vw] flex-col rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]"
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Агент</p>
          <h2 id="system-prompt-title" className="mt-1 text-2xl font-semibold">
            Системная инструкция <span className="text-red-600">#ROLE</span>
          </h2>
        </div>
        <textarea
          className={`${fieldClass} mt-4 min-h-0 flex-1 resize-none`}
          value={value}
          autoFocus
          placeholder={promptPlaceholder}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="mt-4 flex justify-end">
          <Button type="button" onClick={onClose}>
            Готово
          </Button>
        </div>
      </div>
    </div>
  );
}

const channelTone: Record<IntegrationProvider, string> = {
  telegram: "bg-sky-50 text-sky-600",
  whatsapp: "bg-emerald-50 text-emerald-600",
  instagram: "bg-rose-50 text-rose-600",
};

function ChannelSettings({
  agent,
  credentials,
  greenDefaults,
  channels,
  onChannelsChange,
  onWhatsAppCredentials,
}: {
  agent: AgentRecord | null;
  credentials: GreenDefaults;
  greenDefaults: GreenDefaults;
  channels: ActiveChannels;
  onChannelsChange: (channels: ActiveChannels) => void;
  onWhatsAppCredentials: (credentials: GreenDefaults) => void;
}) {
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
      <div>
        <h3 className="font-heading text-lg font-semibold text-zinc-900">Активные каналы</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-500">
          У агента один номер WhatsApp и один Telegram-бот. Выключенный канал не вызывает модель.
        </p>
      </div>
      <input type="hidden" name="active_channels" value={JSON.stringify(channels)} />
      <input type="hidden" name="wa_instance_id" value={credentials.instanceId} />
      <input type="hidden" name="wa_api_token" value={credentials.apiToken} />
      <div className="grid gap-3">
        <div className="grid gap-3 rounded-xl bg-zinc-50 px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 text-sm font-medium text-zinc-800">
              <span className={`grid size-9 place-items-center rounded-xl ${channelTone.whatsapp}`}>
                <ChannelIcon provider="whatsapp" className="size-4" />
              </span>
              WhatsApp
            </span>
            <Switch
              checked={channels.whatsapp}
              onCheckedChange={(checked) => onChannelsChange({ ...channels, whatsapp: checked })}
              aria-label="WhatsApp"
            />
          </label>
          <WhatsAppChannel agent={agent} onConnect={() => setWhatsappOpen(true)} />
        </div>
        <div className="grid gap-3 rounded-xl bg-zinc-50 px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 text-sm font-medium text-zinc-800">
              <span className={`grid size-9 place-items-center rounded-xl ${channelTone.telegram}`}>
                <ChannelIcon provider="telegram" className="size-4" />
              </span>
              Telegram
            </span>
            <Switch
              checked={channels.telegram}
              onCheckedChange={(checked) => onChannelsChange({ ...channels, telegram: checked })}
              aria-label="Telegram"
            />
          </label>
          <TelegramChannel agent={agent} onConnect={() => setTelegramOpen(true)} />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-3">
          <span className="flex items-center gap-3 text-sm font-medium text-zinc-800">
            <span className={`grid size-9 place-items-center rounded-xl ${channelTone.instagram}`}>
              <ChannelIcon provider="instagram" className="size-4" />
            </span>
            Instagram
          </span>
          <Switch
            checked={channels.instagram}
            onCheckedChange={(checked) => onChannelsChange({ ...channels, instagram: checked })}
            aria-label="Instagram"
          />
        </label>
      </div>
      {whatsappOpen ? (
        <WhatsAppConnectDialog
          agentId={agent?.id ?? ""}
          defaults={{
            instanceId: credentials.instanceId || greenDefaults.instanceId,
            apiToken: credentials.apiToken || greenDefaults.apiToken,
          }}
          onApply={onWhatsAppCredentials}
          onClose={() => setWhatsappOpen(false)}
        />
      ) : null}
      {telegramOpen && agent ? <TelegramConnectDialog agentId={agent.id} onClose={() => setTelegramOpen(false)} /> : null}
    </section>
  );
}

function WhatsAppChannel({ agent, onConnect }: { agent: AgentRecord | null; onConnect: () => void }) {
  if (!agent?.waPhoneNumber) {
    return (
      <button
        type="button"
        className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-zinc-800"
        onClick={onConnect}
      >
        + Подключить номер
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
      <p className="truncate text-sm font-medium text-zinc-900">{agent.waPhoneNumber}</p>
      <DisconnectButton agentId={agent.id} kind="whatsapp" label={`Отключить номер ${agent.waPhoneNumber}`} />
    </div>
  );
}

function TelegramChannel({ agent, onConnect }: { agent: AgentRecord | null; onConnect: () => void }) {
  if (!agent) {
    return <p className="text-xs leading-5 text-zinc-500">Сохраните агента, чтобы подключить бота.</p>;
  }
  if (!agent.tgBotUsername) {
    return (
      <button
        type="button"
        className="w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-zinc-800"
        onClick={onConnect}
      >
        Подключить
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
      <p className="truncate text-sm font-medium text-zinc-900">@{agent.tgBotUsername}</p>
      <DisconnectButton agentId={agent.id} kind="telegram" label={`Отключить бота @${agent.tgBotUsername}`} />
    </div>
  );
}

function DisconnectButton({
  agentId,
  kind,
  label,
}: {
  agentId: string;
  kind: "whatsapp" | "telegram";
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDisconnect() {
    setError(null);
    startTransition(async () => {
      const result = kind === "whatsapp" ? await disconnectWhatsApp(agentId) : await disconnectTelegram(agentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
      <AlertDialog>
        <AlertDialogTrigger type="button" className="text-red-500 transition-colors hover:text-red-600 disabled:opacity-40" disabled={pending} aria-label={label}>
          <Trash className="size-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Отключить</AlertDialogTitle>
            <AlertDialogDescription>
              {kind === "whatsapp"
                ? "Номер будет снят с этого агента. История чатов сохранится."
                : "Токен бота будет снят с этого агента. История чатов сохранится."}
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

function TelegramConnectDialog({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await connectTelegram(agentId, token);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      data-channel-dialog=""
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/40 p-4"
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
        aria-labelledby="telegram-connect-title"
        className="w-full max-w-md rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Telegram</p>
        <h2 id="telegram-connect-title" className="mt-1 text-2xl font-semibold">
          Подключить бота
        </h2>
        <label className="mt-5 grid gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Bot Token</span>
          <input
            className={fieldClass}
            type="password"
            value={token}
            autoComplete="off"
            placeholder="123456:ABC..."
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700"
            onClick={onClose}
          >
            Закрыть
          </button>
          <button
            type="button"
            className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            disabled={pending || token.trim().length < 20}
            onClick={onSubmit}
          >
            {pending ? "Подключение" : "Подключить"}
          </button>
        </div>
      </div>
    </div>
  );
}

const responseDelayPresets = [0, 10, 20, 30, 60];

function ResponseDelayField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = Number(value);

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
      <h3 className="font-heading text-lg font-semibold text-zinc-900">Задержка ответа</h3>
      <label className="grid gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          Задержка (в секундах)
          <button
            type="button"
            aria-expanded={open}
            aria-label="Что значит задержка ответа"
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-zinc-300 text-[10px] font-semibold normal-case tracking-normal text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-800"
            onClick={(event) => {
              event.preventDefault();
              setOpen((current) => !current);
            }}
          >
            ?
          </button>
        </span>
        {open ? (
          <span
            role="tooltip"
            className="rounded-xl bg-zinc-950 px-3 py-2.5 text-left text-xs leading-5 font-normal normal-case tracking-normal text-white"
          >
            Бот ждёт это время и склеивает сообщения, которые клиент отправил подряд. 0 сек — пауза 8 секунд. Если значение больше нуля, та же пауза ещё раз стоит перед отправкой каждого сообщения.
          </span>
        ) : null}
        <input
          className={fieldClass}
          name="response_delay"
          type="number"
          min={0}
          step={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {responseDelayPresets.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={selected === preset ? "dark" : "outline"}
            onClick={() => onChange(String(preset))}
          >
            {preset} сек
          </Button>
        ))}
      </div>
    </section>
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
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
      <div className="grid gap-2">
        <h3 className="font-heading text-lg font-semibold text-zinc-900">Вмешательство оператора</h3>
        <p className="text-sm leading-6 text-zinc-500">
          На какое время бот замолчит, если вы ответите клиенту вручную с телефона или ПК.
        </p>
      </div>
      <label className="grid gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Пауза</span>
        <select
          className={fieldClass}
          name="human_handoff_duration"
          value={value}
          onChange={(event) => onChange(event.target.value as HandoffDuration)}
        >
          {HANDOFF_DURATIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
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
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
      <div className="grid gap-2">
        <h3 className="font-heading text-lg font-semibold text-zinc-900">Защита от зацикливания (Лимиты)</h3>
        <p className="text-sm leading-6 text-zinc-500">
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
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
      <h3 className="font-heading text-lg font-semibold text-zinc-900">Форматирование</h3>
      <input type="hidden" name="split_messages" value={enabled ? "true" : "false"} />
      <label className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-3">
        <span className="text-sm font-medium text-zinc-800">Дробить текст на отдельные сообщения</span>
        <Switch checked={enabled} onCheckedChange={onChange} aria-label="Дробить текст на отдельные сообщения" />
      </label>
      <p className="text-sm leading-6 text-zinc-500">
        Если включено, абзацы будут отправляться отдельными сообщениями (пузырями) с учетом задержки между ними
      </p>
    </section>
  );
}

function CreativityField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <label className="grid min-w-0 gap-2">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        Креативность ответов
        <button
          type="button"
          aria-expanded={open}
          aria-label="Что значит креативность ответов"
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-zinc-300 text-[10px] font-semibold normal-case tracking-normal text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-800"
          onClick={(event) => {
            event.preventDefault();
            setOpen((current) => !current);
          }}
        >
          ?
        </button>
      </span>
      {open ? (
        <span
          role="tooltip"
          className="rounded-xl bg-zinc-950 px-3 py-2.5 text-left text-xs leading-5 font-normal normal-case tracking-normal text-white"
        >
          0.0–0.2 — Точные и строгие ответы по инструкциям.
          <br />
          0.7 — Естественный баланс живой речи.
          <br />
          0.8–1.0 — Максимальная свобода и вариативность формулировок.
        </span>
      ) : null}
      <input
        className={fieldClass}
        name="temperature"
        type="number"
        min={0}
        max={2}
        step={0.1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
