"use client";

import { useMemo, useState, useTransition } from "react";

import {
  approveTasks,
  createMessengerWatch,
  createSource,
  launchCampaign,
  rejectTask,
  retryTask,
  runDueNow,
  saveCampaign,
  saveDraft,
  setCampaignStatus,
  updateDelivery,
  type ActionResult,
} from "@/app/ai-tasks/actions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { AgentOption, CampaignCard, SourceCard, TaskCard } from "@/lib/proactive/load";
import { defaultDelivery, type ProactiveChannel } from "@/lib/proactive/delivery";

const idle: ActionResult = { ok: false, error: null, notice: null };
const fieldClass =
  "h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white outline-none placeholder:text-zinc-600";

const CHANNEL_LABEL: Record<ProactiveChannel, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  email: "Email",
};

export function TasksDesk({
  sources,
  campaigns,
  tasks,
  agents,
  timezone,
  migration,
}: {
  sources: SourceCard[];
  campaigns: CampaignCard[];
  tasks: TaskCard[];
  agents: AgentOption[];
  timezone: string;
  migration: boolean;
}) {
  const [notice, setNotice] = useState<ActionResult>(idle);
  const [pending, start] = useTransition();
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [channelPreset, setChannelPreset] = useState<ProactiveChannel>("whatsapp");
  const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
  const selectedAgent = agents.find((agent) => agent.id === agentId) ?? null;

  const pendingTasks = useMemo(
    () => tasks.filter((task) => task.status === "pending_approval" && match(task, campaignFilter, channelFilter)),
    [tasks, campaignFilter, channelFilter],
  );
  const queue = tasks.filter((task) => task.status === "scheduled" || task.status === "sending" || task.status === "sent" || task.status === "failed" || task.status === "stale");

  function run(action: () => Promise<ActionResult>) {
    start(async () => setNotice(await action()));
  }

  return (
    <div className="space-y-6">
      {migration ? (
        <p className="text-sm text-red-300">
          <span>Примените миграции 20261126_proactive_core.sql и 20261127_proactive_dialogs.sql, затем обновите страницу.</span>
        </p>
      ) : null}
      <StatusLine result={notice} />
      <Tabs defaultValue="approval">
        <TabsList className="h-auto">
          <TabsTrigger value="approval">
            <span>{`На утверждении (${pendingTasks.length})`}</span>
          </TabsTrigger>
          <TabsTrigger value="queue">
            <span>Очередь и история</span>
          </TabsTrigger>
          <TabsTrigger value="setup">
            <span>Кампании и источники</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="approval" className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <Filter label="Кампания" value={campaignFilter} onChange={setCampaignFilter} options={[["all", "Все"], ...campaigns.map((item) => [item.id, item.name] as [string, string])]} />
            <Filter label="Канал" value={channelFilter} onChange={setChannelFilter} options={[["all", "Все"], ["whatsapp", "WhatsApp"], ["telegram", "Telegram"], ["email", "Email"]]} />
            <Button type="button" disabled={pending || pendingTasks.length === 0} onClick={() => run(() => approveTasks(pendingTasks.map((task) => task.id)))}>
              <span>{`Одобрить все (${pendingTasks.length})`}</span>
            </Button>
          </div>
          <IntervalForm campaigns={campaigns} disabled={pending} onDone={setNotice} />
          {pendingTasks.length === 0 ? (
            <p className="text-sm text-zinc-400">
              <span>Нет карточек на утверждении.</span>
            </p>
          ) : (
            <ul className="space-y-3">
              {pendingTasks.map((task) => (
                <ApprovalCard key={task.id} task={task} disabled={pending} onRun={run} />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => runDueNow())}>
            <span>Проверить и отправить готовые сейчас</span>
          </Button>
          {queue.length === 0 ? (
            <p className="text-sm text-zinc-400">
              <span>Очередь пустая.</span>
            </p>
          ) : (
            <ul className="space-y-3">
              {queue.map((task) => (
                <li key={task.id} className="space-y-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-white">
                      <span>{task.contactName || task.contactTarget}</span>
                    </p>
                    <span className="flex items-center gap-2">
                      <CategoryBadge category={task.category} />
                      <span className="text-xs text-zinc-400">{CHANNEL_LABEL[task.channel]}</span>
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300">
                    <span>{statusLine(task, timezone)}</span>
                  </p>
                  {task.error ? (
                    <p className="text-sm text-red-300">
                      <span>{task.error}</span>
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {task.status === "scheduled" ? (
                      <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => setCampaignStatus(task.campaignId, "paused"))}>
                        <span>Пауза кампании</span>
                      </Button>
                    ) : null}
                    {task.status === "failed" ? (
                      <Button type="button" disabled={pending} onClick={() => run(() => retryTask(task.id))}>
                        <span>Повторить</span>
                      </Button>
                    ) : null}
                    {campaigns.find((item) => item.id === task.campaignId)?.status === "paused" ? (
                      <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => setCampaignStatus(task.campaignId, "active"))}>
                        <span>Снять паузу</span>
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="setup" className="grid gap-8 lg:grid-cols-2">
          <form action={(formData) => run(() => createMessengerWatch(idle, formData))} className="lg:col-span-2">
            <input type="hidden" name="agent_id" value={agentId} />
            <Button type="submit" disabled={pending || agents.length === 0}>
              <span>Мониторинг активных чатов WhatsApp / Мессенджеров</span>
            </Button>
          </form>
          <form action={(formData) => run(() => createSource(idle, formData))} className="space-y-4">
            <h2 className="text-lg font-semibold text-white">
              <span>Источник</span>
            </h2>
            <input name="name" required placeholder="Название" className={fieldClass} />
            <select name="type" className={fieldClass} defaultValue="csv">
              <option value="csv">CSV</option>
              <option value="google_sheets">Google Таблица</option>
              <option value="pipedrive">Pipedrive</option>
              <option value="amocrm">amoCRM агента</option>
              <option value="strike_chats">Диалоги мессенджеров</option>
            </select>
            <select name="agent_id" className={fieldClass} value={agentId} onChange={(event) => setAgentId(event.target.value)}>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            <input name="file" type="file" accept=".csv,text/csv" className="text-sm text-zinc-300" />
            <input name="url" placeholder="Ссылка на Google Таблицу" className={fieldClass} />
            <input name="api_token" placeholder="API-токен Pipedrive" className={fieldClass} />
            <select name="mode" className={fieldClass} defaultValue="open">
              <option value="open">Открытые сделки</option>
              <option value="stale">Зависшие сделки</option>
              <option value="overdue">Просроченные задачи</option>
            </select>
            <Button type="submit" disabled={pending}>
              <span>Подключить источник</span>
            </Button>
            <SourceList sources={sources} />
          </form>

          <form action={(formData) => run(() => saveCampaign(idle, formData))} className="space-y-4">
            <h2 className="text-lg font-semibold text-white">
              <span>Кампания</span>
            </h2>
            <input name="name" required placeholder="Название" className={fieldClass} />
            <select name="agent_id" required className={fieldClass} value={agentId} onChange={(event) => setAgentId(event.target.value)}>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
            {selectedAgent?.followupEnabled ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                <span>У этого агента включены умные напоминания. Пока их цепочка не закончится, обычный дожим из «Задач ИИ» не создаётся. Запрос КП и оставленный контакт всё равно попадут в очередь, а встроенное напоминание по этому чату остановится.</span>
              </p>
            ) : null}
            <select name="followup_conflict_mode" className={fieldClass} defaultValue="wait_builtin">
              <option value="wait_builtin">Ждать встроенный follow-up</option>
              <option value="override_builtin">Задачи ИИ вместо таймера</option>
            </select>
            <select name="source_id" required className={fieldClass} defaultValue={sources[0]?.id ?? ""}>
              {sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
            <select
              name="channel"
              className={fieldClass}
              value={channelPreset}
              onChange={(event) => setChannelPreset(event.target.value as ProactiveChannel)}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="email">Email</option>
            </select>
            <textarea name="goal_prompt" required placeholder="Задача агента: кого писать и зачем" className={`${fieldClass} h-24 py-2`} />
            <input name="schedule_cron" placeholder="Cron, необязательно: 0 9 * * *" className={fieldClass} />
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" name="require_approval" defaultChecked className="size-4 accent-[#cf0234]" />
              <span>Сначала утверждать карточки</span>
            </label>
            <div key={channelPreset} className="grid gap-3 sm:grid-cols-2">
              <DeliveryFields channel={channelPreset} />
            </div>
            <Button type="submit" disabled={pending || agents.length === 0 || sources.length === 0}>
              <span>Сохранить кампанию</span>
            </Button>
            <CampaignList campaigns={campaigns} disabled={pending} onRun={run} />
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ApprovalCard({
  task,
  disabled,
  onRun,
}: {
  task: TaskCard;
  disabled: boolean;
  onRun: (action: () => Promise<ActionResult>) => void;
}) {
  const [message, setMessage] = useState(task.message);
  const [subject, setSubject] = useState(task.subject);
  return (
    <li className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-white">
          <span>{task.contactName || "Контакт"}</span>
        </p>
        <span className="flex items-center gap-2">
          <CategoryBadge category={task.category} />
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{CHANNEL_LABEL[task.channel]}</span>
        </span>
      </div>
      {task.crmStage ? (
        <p className="text-xs text-zinc-300">
          <span>{`Сделка CRM: ${task.crmStage}`}</span>
        </p>
      ) : null}
      <p className="text-sm text-zinc-400">
        <span>{task.contactTarget}</span>
      </p>
      <p className="text-sm text-zinc-200">
        <span>{`Почему пишем: ${task.reasoning || "без пояснения"}`}</span>
      </p>
      {task.channel === "email" ? (
        <input value={subject} onChange={(event) => setSubject(event.target.value)} className={fieldClass} placeholder="Тема письма" />
      ) : null}
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} className={`${fieldClass} h-28 py-2`} />
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={disabled}
          onClick={() => onRun(async () => {
            const saved = await saveDraft(task.id, message, subject);
            if (!saved.ok) return saved;
            return approveTasks([task.id]);
          })}
        >
          <span>Одобрить</span>
        </Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onRun(() => rejectTask(task.id))}>
          <span>Отклонить</span>
        </Button>
      </div>
    </li>
  );
}

function IntervalForm({
  campaigns,
  disabled,
  onDone,
}: {
  campaigns: CampaignCard[];
  disabled: boolean;
  onDone: (result: ActionResult) => void;
}) {
  const [open, setOpen] = useState(false);
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const campaign = campaigns.find((item) => item.id === campaignId) ?? campaigns[0];
  const [pending, start] = useTransition();
  if (!campaign) return null;
  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" onClick={() => setOpen((value) => !value)}>
        <span>{open ? "Скрыть интервалы" : "Настройки интервалов"}</span>
      </Button>
      {open ? (
        <form
          action={(formData) => start(async () => onDone(await updateDelivery(idle, formData)))}
          className="grid gap-3 rounded-2xl border border-zinc-800 p-4 sm:grid-cols-2"
          key={campaign.id}
        >
          <select name="campaign_id" className={fieldClass} value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
            {campaigns.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <input type="hidden" name="channel" value={campaign.channel} />
          <DeliveryFields channel={campaign.channel} values={campaign.delivery} />
          <Button type="submit" disabled={disabled || pending}>
            <span>Пересчитать очередь</span>
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function DeliveryFields({ channel, values }: { channel: ProactiveChannel; values?: ReturnType<typeof defaultDelivery> }) {
  const preset = values ?? defaultDelivery(channel);
  return (
    <>
      <select name="mode" className={fieldClass} defaultValue={preset.mode} key={`${channel}-mode-${preset.mode}`}>
        <option value="interval">Интервал между сообщениями</option>
        <option value="batch">Пачки</option>
      </select>
      <label className="block text-sm text-zinc-400">
        <span>Пауза от, сек</span>
        <input name="min_delay_sec" type="number" min={0} defaultValue={preset.min_delay_sec} className={`${fieldClass} mt-1`} />
      </label>
      <label className="block text-sm text-zinc-400">
        <span>Пауза до, сек</span>
        <input name="max_delay_sec" type="number" min={0} defaultValue={preset.max_delay_sec} className={`${fieldClass} mt-1`} />
      </label>
      <label className="block text-sm text-zinc-400">
        <span>Размер пачки</span>
        <input name="batch_size" type="number" min={1} defaultValue={preset.batch_size} className={`${fieldClass} mt-1`} />
      </label>
      <label className="block text-sm text-zinc-400">
        <span>Пауза между пачками, сек</span>
        <input name="batch_delay_sec" type="number" min={0} defaultValue={preset.batch_delay_sec} className={`${fieldClass} mt-1`} />
      </label>
      <label className="block text-sm text-zinc-400">
        <span>Лимит в сутки</span>
        <input name="daily_limit" type="number" min={1} defaultValue={preset.daily_limit} className={`${fieldClass} mt-1`} />
      </label>
      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" name="work_hours_only" defaultChecked={preset.work_hours_only} className="size-4 accent-[#cf0234]" />
        <span>Только рабочие часы</span>
      </label>
      <input name="work_hours_start" defaultValue={preset.work_hours_start} className={fieldClass} />
      <input name="work_hours_end" defaultValue={preset.work_hours_end} className={fieldClass} />
    </>
  );
}

function CampaignList({
  campaigns,
  disabled,
  onRun,
}: {
  campaigns: CampaignCard[];
  disabled: boolean;
  onRun: (action: () => Promise<ActionResult>) => void;
}) {
  if (campaigns.length === 0) return null;
  return (
    <ul className="space-y-2">
      {campaigns.map((campaign) => (
        <li key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-300">
          <span>{`${campaign.name} · ${CHANNEL_LABEL[campaign.channel]} · ${campaign.status}`}</span>
          <Button type="button" disabled={disabled} onClick={() => onRun(() => launchCampaign(campaign.id))}>
            <span>Запустить сбор и генерацию ИИ</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

function SourceList({ sources }: { sources: SourceCard[] }) {
  if (sources.length === 0) return null;
  return (
    <ul className="space-y-1 text-sm text-zinc-400">
      {sources.map((source) => (
        <li key={source.id}>
          <span>{`${source.name} · ${source.type} · ${source.detail}`}</span>
        </li>
      ))}
    </ul>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="block text-sm text-zinc-400">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={`${fieldClass} mt-1 w-48`}>
        {options.map(([id, title]) => (
          <option key={id} value={id}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatusLine({ result }: { result: ActionResult }) {
  if (result.error) {
    return (
      <p className="text-sm text-red-300">
        <span>{result.error}</span>
      </p>
    );
  }
  if (result.notice) {
    return (
      <p className="text-sm text-emerald-300">
        <span>{result.notice}</span>
      </p>
    );
  }
  return null;
}

function statusLine(task: TaskCard, timezone: string) {
  if (task.status === "sent") return `Отправлено ${formatStamp(task.sentAt, timezone)}`;
  if (task.status === "failed") return "Ошибка отправки";
  if (task.status === "sending") return "Отправляется";
  if (task.status === "stale") return "Неактуально (диалог обновился)";
  return `Запланировано ${formatStamp(task.scheduledFor, timezone)}`;
}

const CATEGORY_BADGE: Record<string, { label: string; className: string }> = {
  waiting_proposal: { label: "Ждёт КП", className: "bg-amber-500/15 text-amber-200" },
  shared_contact: { label: "Оставил контакт", className: "bg-sky-500/15 text-sky-200" },
  unanswered_question: { label: "Вопрос без ответа", className: "bg-violet-500/15 text-violet-200" },
  stalled_dialog: { label: "Диалог затих", className: "bg-zinc-700 text-zinc-100" },
  crm_followup: { label: "Дожим по CRM", className: "bg-[#cf0234]/15 text-[#ffb3c0]" },
  reactivation: { label: "Реактивация", className: "bg-emerald-500/15 text-emerald-200" },
};

function CategoryBadge({ category }: { category: string }) {
  const badge = CATEGORY_BADGE[category];
  if (!badge) return null;
  return <span className={`rounded-full px-2 py-0.5 text-xs ${badge.className}`}>{badge.label}</span>;
}

function formatStamp(iso: string | null, timezone: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { timeZone: timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
}

function match(task: TaskCard, campaignId: string, channel: string) {
  if (campaignId !== "all" && task.campaignId !== campaignId) return false;
  if (channel !== "all" && task.channel !== channel) return false;
  return true;
}
