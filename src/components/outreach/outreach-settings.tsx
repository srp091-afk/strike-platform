"use client";

import { AlertTriangle, FileSpreadsheet, Info, Loader2, Sparkles, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";

import { generateOutreachInstruction, importContacts, saveCampaignSettings } from "@/app/outreach/actions";
import { cardClass, fieldClass } from "@/components/outreach/outreach-ui";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { toast } from "@/components/ui/toaster";
import { Textarea } from "@/components/ui/textarea";
import {
  OUTREACH_CHANNELS,
  OUTREACH_LANGUAGES,
  OUTREACH_MAX_ROWS,
  type OutreachAgentOption,
  type OutreachCampaign,
  type OutreachChannel,
  type OutreachDelayMode,
  type OutreachLog,
  type OutreachMessageType,
} from "@/lib/outreach-types";

const CHUNK = 500;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

type ParsedFile = { fileName: string; columns: string[]; rows: Array<Record<string, string>> };

function SectionTitle({ index, title, hint }: { index: number; title: string; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-heading text-lg font-semibold text-white">
        <span className="mr-2 text-strike">{index}.</span>
        {title}
      </h2>
      {hint ? <p className="mt-1 text-sm leading-6 text-zinc-400">{hint}</p> : null}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-zinc-400">{children}</span>;
}

async function parseSpreadsheet(file: File): Promise<ParsedFile> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("В файле нет листов.");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "" });
  if (matrix.length < 1) throw new Error("В файле нет строк с данными.");

  // Файл без строки заголовков: первая строка уже содержит данные (номер, e-mail, ссылка).
  const headerless = (matrix[0] ?? []).some((cell) => looksLikeData(String(cell ?? "")));
  const width = Math.max(...matrix.slice(0, 50).map((row) => row.length));
  const headerRow: unknown[] = headerless ? Array.from({ length: width }, () => "") : (matrix[0] ?? []);

  const used = new Map<string, number>();
  const columns = headerRow.map((cell, index) => {
    const base = String(cell ?? "").trim() || `Колонка ${index + 1}`;
    const count = used.get(base) ?? 0;
    used.set(base, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  });

  const rows = matrix
    .slice(headerless ? 0 : 1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""))
    .map((row) => Object.fromEntries(columns.map((column, index) => [column, String(row[index] ?? "").trim()])));
  if (rows.length === 0) throw new Error("В файле нет строк с данными.");
  if (rows.length > OUTREACH_MAX_ROWS) throw new Error(`В файле ${rows.length} строк, максимум ${OUTREACH_MAX_ROWS}.`);
  return { fileName: file.name, columns, rows };
}

function guessColumn(columns: string[], pattern: RegExp) {
  return columns.find((column) => pattern.test(column)) ?? "";
}

const PHONE_VALUE = /^\+?[\d\s().-]{7,}$/;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_VALUE = /^(https?:\/\/|www\.)\S+$/i;
const SOCIAL_VALUE = /(instagram\.com|facebook\.com|fb\.com|t\.me|telegram\.me|vk\.com|linkedin\.com|tiktok\.com|twitter\.com|x\.com)/i;

function isPhone(value: string) {
  return PHONE_VALUE.test(value) && value.replace(/\D/g, "").length >= 7;
}

function looksLikeData(value: string) {
  const v = value.trim();
  return v !== "" && (isPhone(v) || EMAIL_VALUE.test(v) || URL_VALUE.test(v));
}

/** Подбор колонки по содержимому: доля подходящих значений среди непустых в первых 30 строках. */
function guessByContent(parsed: ParsedFile, test: (value: string) => boolean) {
  let best = "";
  let bestShare = 0;
  for (const column of parsed.columns) {
    const values = parsed.rows.slice(0, 30).map((row) => (row[column] ?? "").trim()).filter(Boolean);
    if (values.length === 0) continue;
    const share = values.filter(test).length / values.length;
    if (share > bestShare) {
      best = column;
      bestShare = share;
    }
  }
  return bestShare >= 0.6 ? best : "";
}

export function OutreachSettings({
  campaign,
  total,
  logs,
  agents,
  onChanged,
}: {
  campaign: OutreachCampaign;
  total: number;
  logs: OutreachLog[];
  agents: OutreachAgentOption[];
  onChanged: () => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [agentId, setAgentId] = useState(campaign.agent_id ?? "");
  const [channel, setChannel] = useState<OutreachChannel | null>(campaign.channel_type);
  const [prompt, setPrompt] = useState(campaign.outreach_prompt);
  const [minDelay, setMinDelay] = useState(String(campaign.min_delay_minutes));
  const [maxDelay, setMaxDelay] = useState(String(campaign.max_delay_minutes));
  const [dailyLimit, setDailyLimit] = useState(String(campaign.daily_limit));
  const [webhook, setWebhook] = useState(campaign.webhook_url ?? "");
  const [contactColumn, setContactColumn] = useState(campaign.contact_column ?? "");
  const [websiteColumn, setWebsiteColumn] = useState(campaign.website_column ?? "");
  const [nameColumn, setNameColumn] = useState(campaign.name_column ?? "");
  const [socialColumn, setSocialColumn] = useState(campaign.social_column ?? "");
  const [messageType, setMessageType] = useState<OutreachMessageType>(campaign.message_type);
  const [fixedMessage, setFixedMessage] = useState(campaign.fixed_message);
  const [language, setLanguage] = useState(campaign.language);
  const [generating, startGenerating] = useTransition();
  const [delayMode, setDelayMode] = useState<OutreachDelayMode>(campaign.delay_mode);
  const [fixedDelay, setFixedDelay] = useState(String(campaign.fixed_delay_minutes));
  const fixedRef = useRef<HTMLTextAreaElement>(null);
  const [saving, startSaving] = useTransition();

  const locked = campaign.status === "active";
  const selectedAgent = agents.find((agent) => agent.id === agentId) ?? null;
  const noChannels = Boolean(selectedAgent) && selectedAgent!.channels.length === 0;

  function chooseAgent(id: string) {
    setAgentId(id);
    const next = agents.find((agent) => agent.id === id);
    // Канал сбрасывается, если у нового агента он не активен: 1 кампания = строго 1 канал.
    setChannel((current) => (next && current && next.channels.includes(current) ? current : (next?.channels[0] ?? null)));
  }

  function save() {
    startSaving(async () => {
      const result = await saveCampaignSettings(campaign.id, {
        name,
        agent_id: agentId || null,
        channel_type: channel,
        outreach_prompt: prompt,
        min_delay_minutes: Number(minDelay),
        max_delay_minutes: Number(maxDelay),
        daily_limit: Number(dailyLimit),
        contact_column: contactColumn || null,
        website_column: websiteColumn || null,
        name_column: nameColumn || null,
        social_column: socialColumn || null,
        message_type: messageType,
        fixed_message: fixedMessage,
        language,
        delay_mode: delayMode,
        fixed_delay_minutes: Number(fixedDelay),
        webhook_url: webhook || null,
      });
      if (result.ok) toast.success("Настройки рассылки сохранены");
      else toast.error(result.error);
      onChanged();
    });
  }

  function generateInstruction() {
    startGenerating(async () => {
      const result = await generateOutreachInstruction(agentId);
      if (result.ok) {
        setPrompt(result.instruction);
        toast.success("Инструкция сгенерирована");
      } else {
        toast.error(result.error);
      }
    });
  }

  function insertVariable(variable: string) {
    const area = fixedRef.current;
    const token = `{{${variable}}}`;
    if (!area) return setFixedMessage((current) => current + token);
    const start = area.selectionStart ?? fixedMessage.length;
    const end = area.selectionEnd ?? fixedMessage.length;
    setFixedMessage(fixedMessage.slice(0, start) + token + fixedMessage.slice(end));
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const columnOptions = [{ value: "", label: "— не выбрано —" }, ...campaign.source_columns.map((column) => ({ value: column, label: column }))];

  return (
    <div className="grid gap-6">
      <section className={cardClass}>
        <FieldLabel>Название рассылки</FieldLabel>
        <input className={fieldClass} value={name} maxLength={120} disabled={locked} onChange={(event) => setName(event.target.value)} />
      </section>

      <section className={cardClass}>
        <SectionTitle index={1} title="База контактов" hint="Загрузите CSV или XLSX и сопоставьте колонки: номер/email, сайт, имя и соцсети." />
        <DataSource
          campaignId={campaign.id}
          locked={locked}
          total={total}
          columns={campaign.source_columns}
          sample={logs.slice(0, 3)}
          contactColumn={contactColumn}
          websiteColumn={websiteColumn}
          nameColumn={nameColumn}
          socialColumn={socialColumn}
          columnOptions={columnOptions}
          onContactColumn={setContactColumn}
          onWebsiteColumn={setWebsiteColumn}
          onNameColumn={setNameColumn}
          onSocialColumn={setSocialColumn}
          onImported={(mapping) => {
            setContactColumn(mapping.contact);
            setWebsiteColumn(mapping.website);
            setNameColumn(mapping.name);
            setSocialColumn(mapping.social);
            onChanged();
          }}
        />
      </section>

      <section className={cardClass}>
        <SectionTitle index={2} title="Агент и канал" />
        {agents.length === 0 ? (
          <Button asChild variant="outline">
            <Link href="/agents">Сначала создайте агента в разделе «Агенты»</Link>
          </Button>
        ) : (
          <div className="grid gap-5">
            <div className="max-w-md">
              <FieldLabel>Агент</FieldLabel>
              <SelectField
                value={agentId}
                disabled={locked}
                onChange={chooseAgent}
                options={[{ value: "", label: "— выберите агента —" }, ...agents.map((agent) => ({ value: agent.id, label: agent.name }))]}
              />
            </div>

            {selectedAgent ? (
              noChannels ? (
                <div role="alert" className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-600" />
                  <p>
                    У этого агента нет подключённых каналов. Перейдите в раздел{" "}
                    <Link href={`/agents/${selectedAgent.id}`} className="font-semibold underline">
                      «Агенты»
                    </Link>
                    , подключите и активируйте канал (например, WhatsApp), чтобы использовать его для рассылки.
                  </p>
                </div>
              ) : (
                <div>
                  <FieldLabel>Канал отправки</FieldLabel>
                  <div role="radiogroup" aria-label="Канал отправки" className="flex flex-wrap gap-2">
                    {OUTREACH_CHANNELS.filter((item) => selectedAgent.channels.includes(item.value)).map((item) => {
                      const selected = channel === item.value;
                      return (
                        <button
                          key={item.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          disabled={locked}
                          onClick={() => setChannel(item.value)}
                          className={`rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
                            selected ? "border-rose-500 bg-rose-50 text-rose-900" : "border-gray-200 bg-[#ffffff] text-gray-900 hover:bg-gray-50"
                          }`}
                        >
                          {item.label}
                          {selectedAgent.accounts[item.value] ? ` (${selectedAgent.accounts[item.value]})` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )
            ) : null}

            <div className="flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
              <Info className="mt-0.5 size-5 shrink-0 text-sky-600" />
              <p>
                Этот агент проанализирует сайт и отправит стартовое сообщение в выбранный канал. Как только клиент ответит, бот автоматически
                продолжит диалог, опираясь на свою базовую инструкцию для входящих сообщений из раздела «Агенты».
              </p>
            </div>
          </div>
        )}
      </section>

      <section className={cardClass}>
        <SectionTitle
          index={3}
          title="Первое сообщение"
          hint="Выберите: пусть AI напишет персональный текст по инструкции или отправляйте один и тот же текст с подстановкой переменных."
        />
        <div role="radiogroup" aria-label="Режим первого сообщения" className="mb-4 inline-flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
          {([
            ["ai", "AI-генерация"],
            ["fixed", "Точный текст"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={messageType === value}
              disabled={locked}
              onClick={() => setMessageType(value)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                messageType === value ? "bg-[#ffffff] text-rose-700 shadow-sm ring-1 ring-gray-200" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {messageType === "ai" ? (
          <>
            <p className="mb-3 text-sm leading-6 text-zinc-400">
              Логика только для стартового касания. Например: «Проанализируй сайт, найди главную услугу, составь короткий оффер на 1 абзац и спроси, берут ли они новые объекты». Текст пишет модель выбранного агента.
            </p>
            <Textarea value={prompt} disabled={locked} maxLength={6000} onChange={(event) => setPrompt(event.target.value)} placeholder="Что должно быть в первом сообщении?" />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={generateInstruction}
                disabled={locked || generating || !agentId}
                title={agentId ? undefined : "Сначала выберите агента"}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700 transition-colors hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60"
              >
                {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {generating ? "Генерируем…" : "Сгенерировать инструкцию"}
              </button>
              <span className="text-xs text-zinc-400">AI предложит вариант по системной инструкции агента. Каждый клик даёт новый.</span>
            </div>
            <div className="mt-5 max-w-xs">
              <FieldLabel>Язык сообщения</FieldLabel>
              <SelectField
                value={language}
                disabled={locked}
                onChange={setLanguage}
                options={(OUTREACH_LANGUAGES.includes(language as never) ? [...OUTREACH_LANGUAGES] : [language, ...OUTREACH_LANGUAGES]).map((item) => ({ value: item, label: item }))}
              />
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm leading-6 text-zinc-400">
              Нейросеть не вызывается: сообщение уходит ровно так, как написано. Переменные подставляются из колонок базы.
            </p>
            <Textarea
              ref={fixedRef}
              value={fixedMessage}
              disabled={locked}
              maxLength={4000}
              onChange={(event) => setFixedMessage(event.target.value)}
              placeholder="Здравствуйте, {{Имя}}! Увидел ваш сайт {{Сайт}} и хочу предложить…"
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-400">Вставить переменную:</span>
              {["Имя", "Сайт", "Соцсети", ...campaign.source_columns.filter((column) => !["Имя", "Сайт", "Соцсети"].includes(column)).slice(0, 6)].map((variable) => (
                <button
                  key={variable}
                  type="button"
                  disabled={locked}
                  onClick={() => insertVariable(variable)}
                  className="rounded-lg border border-gray-200 bg-[#ffffff] px-2.5 py-1 text-xs font-medium text-gray-700 transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50"
                >
                  {`{{${variable}}}`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              {"{{Имя}}, {{Сайт}}, {{Соцсети}}, {{Телефон}} берутся из выбранных колонок маппинга; любое другое {{Название}} — из одноимённой колонки файла."}
            </p>
          </>
        )}
      </section>
      <section className={cardClass}>
        <SectionTitle index={4} title="Безопасность и лимиты" hint="Паузы между отправками защищают номер от антиспам-систем: случайные в диапазоне или строго фиксированные." />
        <div className="grid gap-4">
          <div>
            <FieldLabel>Пауза между отправками</FieldLabel>
            <div role="radiogroup" aria-label="Тип паузы" className="inline-flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
              {([
                ["random", "Случайная"],
                ["fixed", "Фиксированная"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={delayMode === value}
                  disabled={locked}
                  onClick={() => setDelayMode(value)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                    delayMode === value ? "bg-[#ffffff] text-rose-700 shadow-sm ring-1 ring-gray-200" : "text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {delayMode === "random" ? (
              <>
                <label>
                  <FieldLabel>Пауза от (мин)</FieldLabel>
                  <input className={fieldClass} type="number" min={0} max={1440} value={minDelay} disabled={locked} onChange={(event) => setMinDelay(event.target.value)} />
                </label>
                <label>
                  <FieldLabel>Пауза до (мин)</FieldLabel>
                  <input className={fieldClass} type="number" min={0} max={1440} value={maxDelay} disabled={locked} onChange={(event) => setMaxDelay(event.target.value)} />
                </label>
              </>
            ) : (
              <label>
                <FieldLabel>Пауза (мин), точно</FieldLabel>
                <input className={fieldClass} type="number" min={0} max={1440} value={fixedDelay} disabled={locked} onChange={(event) => setFixedDelay(event.target.value)} />
              </label>
            )}
            <label>
              <FieldLabel>Суточный лимит</FieldLabel>
              <input className={fieldClass} type="number" min={1} max={5000} value={dailyLimit} disabled={locked} onChange={(event) => setDailyLimit(event.target.value)} />
            </label>
          </div>
        </div>        <label className="mt-4 block">
          <FieldLabel>Вебхук (Make.com, опционально)</FieldLabel>
          <input className={fieldClass} type="url" placeholder="https://hook.eu1.make.com/..." value={webhook} disabled={locked} onChange={(event) => setWebhook(event.target.value)} />
          <span className="mt-1.5 block text-xs text-zinc-400">STRIKE отправит сюда телефон, статус и текст после каждой отправки.</span>
        </label>
      </section>

      <div className="flex items-center justify-end gap-3">
        {locked ? <p className="text-sm text-zinc-400">Рассылка в работе: чтобы изменить настройки, поставьте её на паузу.</p> : null}
        <Button type="button" disabled={saving || locked} onClick={save}>
          {saving ? "Сохраняем..." : "Сохранить настройки"}
        </Button>
      </div>
    </div>
  );
}

function DataSource({
  campaignId,
  locked,
  total,
  columns,
  sample,
  contactColumn,
  websiteColumn,
  nameColumn,
  socialColumn,
  columnOptions,
  onContactColumn,
  onWebsiteColumn,
  onNameColumn,
  onSocialColumn,
  onImported,
}: {
  campaignId: string;
  locked: boolean;
  total: number;
  columns: string[];
  sample: OutreachLog[];
  contactColumn: string;
  websiteColumn: string;
  nameColumn: string;
  socialColumn: string;
  columnOptions: Array<{ value: string; label: string }>;
  onContactColumn: (value: string) => void;
  onWebsiteColumn: (value: string) => void;
  onNameColumn: (value: string) => void;
  onSocialColumn: (value: string) => void;
  onImported: (mapping: { contact: string; website: string; name: string; social: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [newContact, setNewContact] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newName, setNewName] = useState("");
  const [newSocial, setNewSocial] = useState("");
  const [progress, setProgress] = useState<number | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return setFileError("Поддерживаются файлы .csv, .xlsx и .xls.");
    if (file.size > MAX_FILE_BYTES) return setFileError("Файл больше 8 МБ.");
    try {
      const result = await parseSpreadsheet(file);
      setParsed(result);
      setNewContact(guessColumn(result.columns, /phone|тел|whats|номер|mobile|e-?mail|почт/i) || guessByContent(result, (v) => isPhone(v) || EMAIL_VALUE.test(v)));
      setNewWebsite(guessColumn(result.columns, /site|сайт|url|web|домен|domain/i) || guessByContent(result, (v) => URL_VALUE.test(v) && !SOCIAL_VALUE.test(v)));
      setNewName(guessColumn(result.columns, /^(name|имя|фио|first.?name|contact.?name)$/i) || guessColumn(result.columns, /имя|name|фио/i));
      setNewSocial(guessColumn(result.columns, /social|соц|insta|telegram|tg|vk|facebook|linkedin|ссылк/i) || guessByContent(result, (v) => SOCIAL_VALUE.test(v)));
    } catch (error) {
      setParsed(null);
      setFileError(error instanceof Error ? error.message : "Не удалось прочитать файл.");
    }
  }

  async function upload() {
    if (!parsed || !newContact) return;
    setProgress(0);
    try {
      for (let start = 0; start < parsed.rows.length; start += CHUNK) {
        const result = await importContacts(campaignId, {
          columns: parsed.columns,
          rows: parsed.rows.slice(start, start + CHUNK),
          replace: start === 0,
          startIndex: start,
          contact_column: newContact,
          website_column: newWebsite || null,
          name_column: newName || null,
          social_column: newSocial || null,
        });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        setProgress(Math.min(100, Math.round(((start + CHUNK) / parsed.rows.length) * 100)));
      }
      toast.success(`База загружена: ${parsed.rows.length} контактов`);
      onImported({ contact: newContact, website: newWebsite, name: newName, social: newSocial });
      setParsed(null);
    } finally {
      setProgress(null);
    }
  }

  const uploadOptions = parsed
    ? [{ value: "", label: "— не выбрано —" }, ...parsed.columns.map((column) => ({ value: column, label: column }))]
    : [];

  return (
    <div className="grid gap-4">
      {!locked ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleFile(event.dataTransfer.files[0]);
          }}
          className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? "border-strike bg-rose-50" : "border-zinc-700 hover:border-zinc-500"
          }`}
        >
          <UploadCloud className="size-8 text-zinc-500" strokeWidth={1.5} />
          <p className="text-sm font-medium text-white">Перетащите файл сюда или нажмите, чтобы выбрать</p>
          <p className="text-xs text-zinc-400">CSV, XLSX · до {OUTREACH_MAX_ROWS} строк · первая строка — заголовки</p>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }} />
        </div>
      ) : null}
      {fileError ? <p className="text-sm text-rose-700">{fileError}</p> : null}

      {parsed ? (
        <div className="grid gap-4 rounded-xl border border-zinc-800 bg-black/40 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <FileSpreadsheet className="size-4 text-strike" /> {parsed.fileName} · {parsed.rows.length} строк · {parsed.columns.length} колонок
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Колонка с номером / email *</FieldLabel>
              <SelectField value={newContact} options={uploadOptions} onChange={setNewContact} />
            </div>
            <div>
              <FieldLabel>Колонка с сайтом</FieldLabel>
              <SelectField value={newWebsite} options={uploadOptions} onChange={setNewWebsite} />
            </div>
            <div>
              <FieldLabel>Колонка с именем</FieldLabel>
              <SelectField value={newName} options={uploadOptions} onChange={setNewName} />
            </div>
            <div>
              <FieldLabel>Колонка с соцсетями</FieldLabel>
              <SelectField value={newSocial} options={uploadOptions} onChange={setNewSocial} />
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-800">
            <table className="w-full min-w-max text-left text-xs">
              <thead className="bg-gray-50 text-zinc-400">
                <tr>
                  {parsed.columns.map((column) => (
                    <th key={column} className="px-3 py-2 font-medium">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {parsed.rows.slice(0, 3).map((row, index) => (
                  <tr key={index}>
                    {parsed.columns.map((column) => (
                      <td key={column} className="max-w-[200px] truncate px-3 py-2 text-zinc-300">{row[column]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled={!newContact || progress !== null} onClick={() => void upload()}>
              {progress !== null ? `Загружаем ${progress}%` : `Загрузить ${parsed.rows.length} контактов`}
            </Button>
            <Button type="button" variant="outline" disabled={progress !== null} onClick={() => setParsed(null)}>
              Отмена
            </Button>
            {!newContact ? <span className="text-xs text-rose-700">Укажите колонку с номером или email</span> : null}
          </div>
        </div>
      ) : null}

      {!parsed && total > 0 ? (
        <div className="grid gap-4 rounded-xl border border-zinc-800 bg-black/40 p-4">
          <p className="text-sm font-medium text-white">
            Загружено контактов: {total} · колонок: {columns.length}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Колонка с номером / email</FieldLabel>
              <SelectField value={contactColumn} options={columnOptions} onChange={onContactColumn} disabled={locked} />
            </div>
            <div>
              <FieldLabel>Колонка с сайтом</FieldLabel>
              <SelectField value={websiteColumn} options={columnOptions} onChange={onWebsiteColumn} disabled={locked} />
            </div>
            <div>
              <FieldLabel>Колонка с именем</FieldLabel>
              <SelectField value={nameColumn} options={columnOptions} onChange={onNameColumn} disabled={locked} />
            </div>
            <div>
              <FieldLabel>Колонка с соцсетями</FieldLabel>
              <SelectField value={socialColumn} options={columnOptions} onChange={onSocialColumn} disabled={locked} />
            </div>
          </div>
          {sample.length > 0 ? (
            <p className="truncate text-xs text-zinc-400">
              Пример: {columns.map((column) => sample[0].contact_data[column]).filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <p className="text-xs text-zinc-400">Новый файл заменит текущую базу и сбросит статусы.</p>
        </div>
      ) : null}
    </div>
  );
}
