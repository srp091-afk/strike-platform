"use client";

import { Play } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { deleteAgent, saveAgent, type SaveState } from "@/app/agents/actions";
import { assignWhatsAppAccountAgent, unbindWhatsAppAccount } from "@/app/integrations/actions";
import { ChannelIcon } from "@/components/channel-icons";
import { Button } from "@/components/ui/button";
import { DialogContent } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  AGENT_MODELS,
  DEFAULT_ACTIVE_CHANNELS,
  type ActiveChannels,
  type AgentRecord,
} from "@/lib/agent-models";
import type { IntegrationProvider } from "@/lib/integration-catalog";
import type { WhatsAppAccountView } from "@/lib/whatsapp-accounts";

const fieldClass =
  "w-full rounded-xl border border-transparent bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 hover:bg-zinc-100/80 focus:border-zinc-300 focus:bg-white";

const initialState: SaveState = { ok: false, error: null, savedId: null };

export function AgentManager({
  agents,
  whatsappAccounts,
  loadError,
}: {
  agents: AgentRecord[];
  whatsappAccounts: WhatsAppAccountView[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AgentRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [state, action, pending] = useActionState(saveAgent, initialState);

  useEffect(() => {
    if (!state.savedId) return;
    setEditing(null);
    setDialogOpen(false);
    router.refresh();
  }, [state.savedId, router]);

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
          whatsappAccounts={whatsappAccounts}
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
  whatsappAccounts,
  onClose,
}: {
  editing: AgentRecord | null;
  action: (payload: FormData) => void;
  pending: boolean;
  error: string | null;
  whatsappAccounts: WhatsAppAccountView[];
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
    <div className="fixed inset-0 z-[60]">
      <DialogContent aria-labelledby="agent-dialog-title" className="flex flex-col overflow-hidden">
        <form action={action} className="flex min-h-0 flex-1 flex-col">
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
              <Button type="submit" disabled={pending}>
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
                  <input className={fieldClass} name="name" required defaultValue={editing?.name ?? ""} placeholder="Квалификатор" />
                </label>

                <label className="grid min-w-0 gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Модель</span>
                  <select className={fieldClass} name="model" defaultValue={editing?.model ?? "gpt-4o-mini"}>
                    {AGENT_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.value} ({model.label})
                      </option>
                    ))}
                  </select>
                </label>

                <CreativityField defaultValue={editing?.temperature ?? 0.7} />

                <label className="grid gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                    Системная инструкция <span className="text-red-600">#ROLE</span>
                  </span>
                  <textarea
                    className={`${fieldClass} min-h-80 resize-y`}
                    name="system_prompt"
                    required
                    defaultValue={editing?.system_prompt ?? ""}
                    placeholder={"#ROLE\nТы оператор STRIKE. Отвечай коротко, по делу, без воды."}
                  />
                </label>

                {error ? <p className="text-sm text-red-600">{error}</p> : null}
              </section>

              <div className="grid content-start gap-6">
                <ChannelSettings
                  agentId={editing?.id ?? null}
                  accounts={whatsappAccounts}
                  initial={editing?.active_channels ?? DEFAULT_ACTIVE_CHANNELS}
                />
                <ResponseDelayField defaultValue={editing?.response_delay ?? 0} />
                <SplitMessagesField defaultValue={editing?.split_messages ?? false} />
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </div>
  );
}

const channelTone: Record<IntegrationProvider, string> = {
  telegram: "bg-sky-50 text-sky-600",
  whatsapp: "bg-emerald-50 text-emerald-600",
  instagram: "bg-rose-50 text-rose-600",
};

const channelOptions: { id: IntegrationProvider; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "telegram", label: "Telegram" },
  { id: "instagram", label: "Instagram" },
];

function ChannelSettings({
  agentId,
  accounts,
  initial,
}: {
  agentId: string | null;
  accounts: WhatsAppAccountView[];
  initial: ActiveChannels;
}) {
  const [channels, setChannels] = useState<ActiveChannels>(initial);

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
      <div>
        <h3 className="font-heading text-lg font-semibold text-zinc-900">Активные каналы</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-500">
          Агент отвечает только в включённых каналах. Выключенный WhatsApp не вызывает модель.
        </p>
      </div>
      <input type="hidden" name="active_channels" value={JSON.stringify(channels)} />
      <div className="grid gap-3">
        {channelOptions.map((channel) =>
          channel.id === "whatsapp" ? (
            <div key={channel.id} className="grid gap-3 rounded-xl bg-zinc-50 px-4 py-3">
              <label className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3 text-sm font-medium text-zinc-800">
                  <span className={`grid size-9 place-items-center rounded-xl ${channelTone.whatsapp}`}>
                    <ChannelIcon provider="whatsapp" className="size-4" />
                  </span>
                  WhatsApp
                </span>
                <Switch
                  checked={channels.whatsapp}
                  onCheckedChange={(checked) => setChannels((current) => ({ ...current, whatsapp: checked }))}
                  aria-label="WhatsApp"
                />
              </label>
              <WhatsAppNumberSwitches agentId={agentId} accounts={accounts} />
            </div>
          ) : (
            <label
              key={channel.id}
              className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-3"
            >
              <span className="flex items-center gap-3 text-sm font-medium text-zinc-800">
                <span className={`grid size-9 place-items-center rounded-xl ${channelTone[channel.id]}`}>
                  <ChannelIcon provider={channel.id} className="size-4" />
                </span>
                {channel.label}
              </span>
              <Switch
                checked={channels[channel.id]}
                onCheckedChange={(checked) => setChannels((current) => ({ ...current, [channel.id]: checked }))}
                aria-label={channel.label}
              />
            </label>
          ),
        )}
      </div>
    </section>
  );
}

function WhatsAppNumberSwitches({
  agentId,
  accounts,
}: {
  agentId: string | null;
  accounts: WhatsAppAccountView[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const boundIds = new Set(accounts.filter((account) => account.agentId === agentId).map((account) => account.id));

  async function onToggle(accountId: string, enabled: boolean) {
    if (!agentId) return;
    setError(null);
    setPendingId(accountId);
    const result = enabled
      ? await assignWhatsAppAccountAgent(accountId, agentId)
      : await unbindWhatsAppAccount(accountId);
    setPendingId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (!agentId) {
    return <p className="text-xs leading-5 text-zinc-500">Сохраните агента, чтобы привязать номер.</p>;
  }

  if (accounts.length === 0) {
    return <p className="text-xs leading-5 text-zinc-500">Подключённых номеров пока нет.</p>;
  }

  return (
    <div className="grid gap-2">
      {accounts.map((account) => {
        const enabled = boundIds.has(account.id);
        return (
          <div key={account.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">{account.phoneNumber}</p>
              <p className="text-xs text-zinc-500">{enabled ? "Включен для этого агента" : "Отключен"}</p>
            </div>
            <Switch
              checked={enabled}
              disabled={pendingId === account.id}
              aria-label={`${account.phoneNumber}: ${enabled ? "Включен для этого агента" : "Отключен"}`}
              onCheckedChange={(checked) => void onToggle(account.id, checked)}
            />
          </div>
        );
      })}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

const responseDelayPresets = [0, 10, 20, 30, 60];

function ResponseDelayField({ defaultValue }: { defaultValue: number }) {
  const [seconds, setSeconds] = useState(String(defaultValue));
  const [open, setOpen] = useState(false);
  const selected = Number(seconds);

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
            Имитация печати человека перед отправкой ответа. 0 сек — мгновенный ответ.
          </span>
        ) : null}
        <input
          className={fieldClass}
          name="response_delay"
          type="number"
          min={0}
          step={1}
          value={seconds}
          onChange={(event) => setSeconds(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {responseDelayPresets.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant={selected === preset ? "dark" : "outline"}
            onClick={() => setSeconds(String(preset))}
          >
            {preset} сек
          </Button>
        ))}
      </div>
    </section>
  );
}

function SplitMessagesField({ defaultValue }: { defaultValue: boolean }) {
  const [enabled, setEnabled] = useState(defaultValue);

  return (
    <section className="grid content-start gap-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
      <h3 className="font-heading text-lg font-semibold text-zinc-900">Форматирование</h3>
      <input type="hidden" name="split_messages" value={enabled ? "true" : "false"} />
      <label className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-3">
        <span className="text-sm font-medium text-zinc-800">Дробить текст на отдельные сообщения</span>
        <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Дробить текст на отдельные сообщения" />
      </label>
      <p className="text-sm leading-6 text-zinc-500">
        Если включено, абзацы будут отправляться отдельными сообщениями (пузырями) с учетом задержки между ними
      </p>
    </section>
  );
}

function CreativityField({ defaultValue }: { defaultValue: number }) {
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
        defaultValue={defaultValue}
      />
    </label>
  );
}
