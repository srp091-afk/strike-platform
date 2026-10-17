"use client";

import { Maximize, Play, Trash } from "lucide-react";
import { startTransition, useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlaygroundChat } from "@/components/playground-chat";
import { deleteAgent, saveAgent, type SaveState } from "@/app/agents/actions";
import { connectTelegram, disconnectTelegram, disconnectWhatsApp, saveWhatsAppPhone } from "@/app/agents/channels";
import { ChannelIcon } from "@/components/channel-icons";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { SelectField } from "@/components/ui/select-field";
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
  "w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none transition-colors duration-200 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-white";

const initialState: SaveState = {
  ok: false,
  error: null,
  savedId: null,
  attemptId: null,
  agentId: null,
  waPhoneNumber: null,
};

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
  const [testing, setTesting] = useState<AgentRecord | null>(null);
  const closeTesting = useCallback(() => setTesting(null), []);
  const [dialogOpen, setDialogOpen] = useState(false);
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
    setSessionKey("new");
    setDialogOpen(true);
  }

  function openEdit(agent: AgentRecord) {
    setEditing(agent);
    setSessionKey(agent.id);
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
        <p className="mb-6 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">{loadError}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Список агентов</h2>
        <Button type="button" onClick={openCreate}>
          + Создать агента
        </Button>
      </div>

      {agents.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 px-6 py-10 text-sm text-zinc-400">
          Агентов пока нет. Создайте первого, чтобы подключить канал или открыть симулятор.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-md transition-colors duration-200 hover:border-zinc-600"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-xl font-semibold tracking-tight text-white">{agent.name}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-widest text-zinc-400">{agent.model}</p>
                  <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                    {agent.system_prompt}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" aria-label={`Тестировать агента ${agent.name}`} onClick={() => setTesting(agent)}>
                    <Play className="size-4" strokeWidth={2} />
                    Тестировать
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
          key={sessionKey}
          editing={editing}
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
    </div>
  );
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
        <header className="flex items-center justify-between gap-3 border-b border-zinc-800/80 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Симулятор</p>
            <h2 id="simulator-dialog-title" className="truncate font-heading text-lg font-semibold text-white">
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
            agents={agents.map((item) => ({ id: item.id, name: item.name, model: item.model }))}
            initialAgentId={agent.id}
            loadError={null}
            embedded
          />
        </div>
      </DialogContent>
    </div>
  );
}

function AgentDialog({
  editing,
  action,
  pending,
  error,
  saved,
  greenDefaults,
  onClose,
}: {
  editing: AgentRecord | null;
  action: (payload: FormData) => void;
  pending: boolean;
  error: string | null;
  saved: { attemptId: string; agentId: string; waPhoneNumber: string } | null;
  greenDefaults: GreenDefaults;
  onClose: () => void;
}) {
  const [initialDraft] = useState(() => draftFromAgent(editing));
  const [draft, setDraft] = useState(initialDraft);
  const [baseline, setBaseline] = useState(initialDraft);
  const [persistedId, setPersistedId] = useState(editing?.id ?? "");
  const dirty = !sameDraft(draft, baseline);
  const draftRef = useRef(draft);
  draftRef.current = draft;
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
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 bg-black px-6 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Агент</p>
              <h2 id="agent-dialog-title" className="text-2xl font-semibold">
                {persistedId ? "Правка агента" : "Новый агент"}
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
              <section className="grid content-start gap-4 rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-md">
                {persistedId ? <input type="hidden" name="id" value={persistedId} /> : null}

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

                <SystemPromptField
                  value={draft.system_prompt}
                  onChange={(system_prompt) => patchDraft({ system_prompt })}
                />

                {error ? <p className="text-sm text-red-400">{error}</p> : null}
              </section>

              <div className="grid content-start gap-6">
                <ChannelSettings
                  agent={editing}
                  agentId={persistedId}
                  credentials={{ instanceId: draft.wa_instance_id, apiToken: draft.wa_api_token }}
                  phone={draft.wa_phone_number}
                  greenDefaults={greenDefaults}
                  channels={draft.active_channels}
                  onChannelsChange={(active_channels) => patchDraft({ active_channels })}
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
                <ResponseDelayField
                  value={draft.response_delay}
                  onChange={(response_delay) => patchDraft({ response_delay })}
                />
                <HumanHandoffField
                  value={draft.human_handoff_duration}
                  onChange={(human_handoff_duration) => patchDraft({ human_handoff_duration })}
                />
                <LeadNotificationsField
                  value={draft.telegram_chat_id}
                  onChange={(telegram_chat_id) => patchDraft({ telegram_chat_id })}
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
  telegram_chat_id: string;
  limit_agent_messages: string;
  limit_client_messages: string;
  limit_total_messages: string;
  split_messages: boolean;
  wa_instance_id: string;
  wa_api_token: string;
  wa_phone_number: string;
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
    telegram_chat_id: agent?.telegram_chat_id ?? "",
    limit_agent_messages: String(agent?.limit_agent_messages ?? 0),
    limit_client_messages: String(agent?.limit_client_messages ?? 0),
    limit_total_messages: String(agent?.limit_total_messages ?? 0),
    split_messages: agent?.split_messages ?? false,
    wa_instance_id: agent?.waInstanceId ?? "",
    wa_api_token: agent?.waApiToken ?? "",
    wa_phone_number: agent?.waPhoneNumber ?? "",
  };
}

function sameDraft(left: AgentDraft, right: AgentDraft) {
  return (
    left.name === right.name &&
    left.model === right.model &&
    left.system_prompt === right.system_prompt &&
    left.human_handoff_duration === right.human_handoff_duration &&
    left.telegram_chat_id.trim() === right.telegram_chat_id.trim() &&
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
    left.wa_api_token === right.wa_api_token &&
    left.wa_phone_number === right.wa_phone_number
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-prompt-title"
        className="flex h-[90vh] w-[90vw] flex-col rounded-2xl border border-zinc-800 bg-zinc-950 p-6"
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Агент</p>
          <h2 id="system-prompt-title" className="mt-1 text-2xl font-semibold">
            Системная инструкция <span className="text-white">#ROLE</span>
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
  telegram: "border border-zinc-700 bg-zinc-900 text-white",
  whatsapp: "border border-zinc-700 bg-zinc-900 text-white",
  instagram: "border border-zinc-700 bg-zinc-900 text-white",
};

function ChannelSettings({
  agent,
  agentId,
  credentials,
  phone,
  greenDefaults,
  channels,
  onChannelsChange,
  onWhatsAppCredentials,
  onWhatsAppPhone,
  onWhatsAppCleared,
}: {
  agent: AgentRecord | null;
  agentId: string;
  credentials: GreenDefaults;
  phone: string;
  greenDefaults: GreenDefaults;
  channels: ActiveChannels;
  onChannelsChange: (channels: ActiveChannels) => void;
  onWhatsAppCredentials: (credentials: GreenDefaults) => void;
  onWhatsAppPhone: (phone: string) => void;
  onWhatsAppCleared: () => void;
}) {
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [telegramOpen, setTelegramOpen] = useState(false);

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-md">
      <div>
        <h3 className="font-heading text-lg font-semibold text-white">Активные каналы</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-400">
          У агента один номер WhatsApp и один Telegram-бот. Выключенный канал не вызывает модель.
        </p>
      </div>
      <input type="hidden" name="active_channels" value={JSON.stringify(channels)} />
      <input type="hidden" name="wa_instance_id" value={credentials.instanceId} />
      <input type="hidden" name="wa_api_token" value={credentials.apiToken} />
      <input type="hidden" name="wa_phone_number" value={phone} />
      <div className="grid gap-3">
        <div className="grid gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
          <label className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-3 text-sm font-medium text-zinc-200">
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
          <WhatsAppChannel
            agentId={agentId}
            instanceId={credentials.instanceId}
            phone={phone}
            onConnect={() => setWhatsappOpen(true)}
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
              checked={channels.telegram}
              onCheckedChange={(checked) => onChannelsChange({ ...channels, telegram: checked })}
              aria-label="Telegram"
            />
          </label>
          <TelegramChannel agent={agent} onConnect={() => setTelegramOpen(true)} />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black/40 px-4 py-3">
          <span className="flex items-center gap-3 text-sm font-medium text-zinc-200">
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

function WhatsAppChannel({
  agentId,
  instanceId,
  phone,
  onConnect,
  onPhoneSaved,
  onCleared,
}: {
  agentId: string;
  instanceId: string;
  phone: string;
  onConnect: () => void;
  onPhoneSaved: (phone: string) => void;
  onCleared: () => void;
}) {
  const savedPhone = phone && phone !== instanceId ? phone : "";
  if (!instanceId && !savedPhone) {
    return (
      <button
        type="button"
        className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.2)]"
        onClick={onConnect}
      >
        + Подключить номер
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
          className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black transition-shadow hover:shadow-[0_0_15px_rgba(255,255,255,0.2)] disabled:opacity-50"
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

function TelegramChannel({ agent, onConnect }: { agent: AgentRecord | null; onConnect: () => void }) {
  if (!agent) {
    return <p className="text-xs leading-5 text-zinc-400">Сохраните агента, чтобы подключить бота.</p>;
  }
  if (!agent.tgBotUsername) {
    return (
      <button
        type="button"
        className="w-full rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black transition-shadow duration-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.2)]"
        onClick={onConnect}
      >
        Подключить
      </button>
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
      <p className="truncate text-sm font-medium text-white">@{agent.tgBotUsername}</p>
      <DisconnectButton agentId={agent.id} kind="telegram" label={`Отключить бота @${agent.tgBotUsername}`} />
    </div>
  );
}

function DisconnectButton({
  agentId,
  kind,
  label,
  onDisconnected,
}: {
  agentId: string;
  kind: "whatsapp" | "telegram";
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
        const result = kind === "whatsapp" ? await disconnectWhatsApp(agentId) : await disconnectTelegram(agentId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
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
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4"
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
        className="w-full max-w-md rounded-2xl border border-zinc-800/50 bg-zinc-950 p-6"
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
        {error ? <p className="mt-3 text-sm text-red-400">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white"
            onClick={onClose}
          >
            Закрыть
          </button>
          <button
            type="button"
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50"
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
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-md">
      <h3 className="font-heading text-lg font-semibold text-white">Задержка ответа</h3>
      <label className="grid gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          Задержка (в секундах)
          <button
            type="button"
            aria-expanded={open}
            aria-label="Что значит задержка ответа"
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-zinc-700 text-[10px] font-semibold normal-case tracking-normal text-zinc-400 transition-colors hover:border-zinc-400 hover:text-white"
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
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-md">
      <div className="grid gap-2">
        <h3 className="font-heading text-lg font-semibold text-white">Вмешательство оператора</h3>
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

function LeadNotificationsField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [enabled, setEnabled] = useState(() => value.trim().length > 0);

  function toggle(next: boolean) {
    setEnabled(next);
    if (!next) onChange("");
  }

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-md">
      <h3 className="font-heading text-lg font-semibold text-white">Уведомления о лидах</h3>
      {enabled ? null : <input type="hidden" name="telegram_chat_id" value="" />}
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
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-md">
      <div className="grid gap-2">
        <h3 className="font-heading text-lg font-semibold text-white">Защита от зацикливания (Лимиты)</h3>
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
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 backdrop-blur-md">
      <h3 className="font-heading text-lg font-semibold text-white">Форматирование</h3>
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
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-zinc-700 text-[10px] font-semibold normal-case tracking-normal text-zinc-400 transition-colors hover:border-zinc-400 hover:text-white"
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
