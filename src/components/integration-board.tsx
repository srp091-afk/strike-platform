"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import { Check, X } from "lucide-react";

import {
  assignIntegrationAgent,
  assignWhatsAppAccountAgent,
  deleteWhatsAppAccount,
  saveIntegration,
  type SaveIntegrationState,
} from "@/app/integrations/actions";
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
import { WhatsAppConnectDialog } from "@/components/whatsapp-connect-dialog";
import {
  integrationCatalog,
  integrationDefinition,
  type IntegrationProvider,
  type IntegrationView,
} from "@/lib/integration-catalog";
import type { WhatsAppAccountView } from "@/lib/whatsapp-accounts";
import { cn } from "@/lib/utils";

type AgentOption = {
  id: string;
  name: string;
  isActive: boolean;
};

const fieldClass =
  "w-full rounded-xl border border-transparent bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 hover:bg-zinc-100/80 focus:border-zinc-300 focus:bg-white";

const iconTone: Record<IntegrationProvider, string> = {
  telegram: "bg-sky-50 text-sky-600",
  whatsapp: "bg-emerald-50 text-emerald-600",
  instagram: "bg-rose-50 text-rose-600",
};

const initialSave: SaveIntegrationState = { ok: false, error: null, savedId: null };

export function IntegrationBoard({
  agents,
  integrations,
  whatsappAccounts,
  loadError,
}: {
  agents: AgentOption[];
  integrations: IntegrationView[];
  whatsappAccounts: WhatsAppAccountView[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [agentByProvider, setAgentByProvider] = useState<Record<string, string>>(() =>
    initialAgents(agents, integrations),
  );
  const [open, setOpen] = useState<IntegrationProvider | null>(null);
  const [connectWhatsApp, setConnectWhatsApp] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [pendingAssign, startAssign] = useTransition();

  useEffect(() => {
    setAgentByProvider((current) => {
      const next = { ...current };
      for (const row of integrations) {
        if (row.agentId && agents.some((agent) => agent.id === row.agentId)) {
          next[row.provider] = row.agentId;
        }
      }
      return next;
    });
  }, [agents, integrations]);

  function onAgentChange(provider: IntegrationProvider, agentId: string) {
    setAgentByProvider((current) => ({ ...current, [provider]: agentId }));
    setAssignError(null);
    const row = integrations.find((item) => item.provider === provider);
    if (!row || !agentId) return;

    startAssign(async () => {
      const result = await assignIntegrationAgent(row.id, agentId);
      if (!result.ok) {
        setAssignError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      {loadError ? (
        <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
      ) : null}
      {agents.length === 0 ? (
        <p className="mb-6 text-sm text-zinc-500">Сначала создайте агента — без него канал некому обрабатывать.</p>
      ) : null}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {integrationCatalog.map((channel) => {
          const row = integrations.find((item) => item.provider === channel.provider);
          const agentId = agentByProvider[channel.provider] ?? "";
          const active =
            channel.provider === "whatsapp"
              ? whatsappAccounts.some((account) => account.isActive)
              : Boolean(row?.active);

          return (
            <article
              key={channel.provider}
              className="flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", iconTone[channel.provider])}>
                      <ChannelIcon provider={channel.provider} className="size-5" />
                    </span>
                    <h2 className="text-lg font-semibold">{channel.title}</h2>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest",
                      active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500",
                    )}
                  >
                    {channel.provider === "whatsapp" ? (active ? "Активен" : "Отключено") : active ? "Подключено" : "Отключено"}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-zinc-500">{channel.description}</p>
              </div>

              <div className="mt-6">
                {channel.provider === "whatsapp" ? (
                  <WhatsAppAccountList
                    accounts={whatsappAccounts}
                    agents={agents}
                    onConnect={() => setConnectWhatsApp(true)}
                  />
                ) : (
                  <>
                    <label className="grid gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Агент</span>
                      <select
                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition-all duration-200 focus:border-zinc-300 disabled:opacity-50"
                        value={agentId}
                        disabled={agents.length === 0 || pendingAssign}
                        onChange={(event) => onAgentChange(channel.provider, event.target.value)}
                      >
                        <option value="">Выберите агента</option>
                        {agents
                          .filter((agent) => agent.isActive || agent.id === agentId)
                          .map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    {assignError ? <p className="mt-2 text-xs text-red-600">{assignError}</p> : null}
                    <button
                      type="button"
                      className="mt-4 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-zinc-800 disabled:opacity-50"
                      disabled={!agentId}
                      onClick={() => setOpen(channel.provider)}
                    >
                      {active ? "Настроить" : "Подключить"}
                    </button>
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {connectWhatsApp ? (
        <WhatsAppConnectDialog agents={agents} onClose={() => setConnectWhatsApp(false)} />
      ) : null}
      {open && open !== "whatsapp" ? (
        <IntegrationDialog
          key={open}
          provider={open}
          agentId={agentByProvider[open] ?? ""}
          agentName={agents.find((agent) => agent.id === agentByProvider[open])?.name ?? ""}
          hasCredentials={Boolean(integrations.find((item) => item.provider === open)?.hasCredentials)}
          active={Boolean(integrations.find((item) => item.provider === open)?.active)}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}

function WhatsAppAccountList({
  accounts,
  agents,
  onConnect,
}: {
  accounts: WhatsAppAccountView[];
  agents: AgentOption[];
  onConnect: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onAgentChange(accountId: string, agentId: string) {
    if (!agentId) return;
    setError(null);
    startTransition(async () => {
      const result = await assignWhatsAppAccountAgent(accountId, agentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function onDelete(accountId: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteWhatsAppAccount(accountId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div>
      {accounts.length === 0 ? (
        <p className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-500">Подключённых номеров пока нет.</p>
      ) : (
        <ul className="grid gap-3">
          {accounts.map((account) => (
            <li key={account.id} className="grid gap-2 rounded-xl bg-zinc-50 px-3 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-zinc-900">{account.phoneNumber}</p>
                <AlertDialog>
                  <AlertDialogTrigger
                    className="text-xs font-medium text-red-500 transition-colors hover:text-red-600 disabled:opacity-50"
                    disabled={pending}
                  >
                    Удалить
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Удалить номер?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Номер {account.phoneNumber} будет отключён от STRIKE. История чатов сохранится.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Отмена</AlertDialogCancel>
                      <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={() => onDelete(account.id)}>
                        Удалить
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {account.isActive ? (
                <p className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                  <Check className="size-3.5" />
                  Авторизован
                </p>
              ) : (
                <p className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                  <X className="size-3.5" />
                  Отключен
                </p>
              )}
              <select
                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 outline-none transition-all duration-200 focus:border-zinc-300 disabled:opacity-50"
                value={account.agentId}
                disabled={pending || agents.length === 0}
                aria-label={`Агент для ${account.phoneNumber}`}
                onChange={(event) => onAgentChange(account.id, event.target.value)}
              >
                {agents
                  .filter((agent) => agent.isActive || agent.id === account.agentId)
                  .map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
              </select>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
      <button
        type="button"
        className="mt-4 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-zinc-800 disabled:opacity-50"
        disabled={agents.length === 0}
        onClick={onConnect}
      >
        + Подключить номер
      </button>
    </div>
  );
}

function IntegrationDialog({
  provider,
  agentId,
  agentName,
  hasCredentials,
  active,
  onClose,
}: {
  provider: IntegrationProvider;
  agentId: string;
  agentName: string;
  hasCredentials: boolean;
  active: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveIntegration, initialSave);
  const channel = integrationDefinition(provider);

  useEffect(() => {
    if (!state.ok) return;
    onClose();
    router.refresh();
  }, [state.ok, state.savedId, onClose, router]);

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
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="integration-dialog-title"
        className="w-full max-w-md rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{channel.title}</p>
        <h2 id="integration-dialog-title" className="mt-1 text-2xl font-semibold">
          {active ? "Настройка" : "Подключение"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">{dialogHint(provider)}</p>
        {provider === "telegram" ? (
          <a
            className="mt-2 inline-block text-sm font-medium text-red-600 underline-offset-4 transition-colors hover:text-red-700 hover:underline"
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
          >
            Открыть @BotFather
          </a>
        ) : null}
        <p className="mt-4 text-sm text-zinc-700">
          Агент: <span className="font-medium text-zinc-900">{agentName || "не выбран"}</span>
        </p>

        <form action={action} className="mt-5 grid gap-4">
          <input type="hidden" name="provider" value={provider} />
          <input type="hidden" name="agent_id" value={agentId} />
          {channel.fields.map((field) => (
            <label key={field.name} className="grid gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">{field.label}</span>
              <input
                className={fieldClass}
                name={field.name}
                type={field.secret ? "password" : "text"}
                autoComplete="off"
                autoFocus={field.name === channel.fields[0]?.name}
                placeholder={hasCredentials ? "Оставьте пустым, чтобы не менять" : ""}
                disabled={pending}
              />
            </label>
          ))}
          {state.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            {active ? (
              <button
                type="submit"
                name="intent"
                value="disable"
                className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 disabled:opacity-50"
                disabled={pending}
              >
                Отключить
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-all duration-200 hover:bg-zinc-50"
                onClick={onClose}
              >
                Отмена
              </button>
              <button
                type="submit"
                name="intent"
                value="save"
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-zinc-800 disabled:opacity-50"
                disabled={pending || !agentId}
              >
                Сохранить интеграцию
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function dialogHint(provider: IntegrationProvider) {
  if (provider === "telegram") {
    return "Токен выдаёт @BotFather. Создайте бота командой /newbot и вставьте выданный ключ.";
  }
  return "Токен приложения Meta с доступом к Instagram Messaging и ID страницы Facebook, к которой подключён аккаунт.";
}

function initialAgents(agents: AgentOption[], integrations: IntegrationView[]) {
  const activeAgents = agents.filter((agent) => agent.isActive);
  const only = activeAgents.length === 1 ? activeAgents[0].id : "";
  const next: Record<string, string> = {};
  for (const channel of integrationCatalog) {
    const saved = integrations.find((item) => item.provider === channel.provider)?.agentId;
    next[channel.provider] = saved && agents.some((agent) => agent.id === saved) ? saved : only;
  }
  return next;
}
