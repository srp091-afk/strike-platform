"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { StudioSelect, StudioToggle } from "@/components/sites/studio-controls";
import { disabledResult, type QuizSchema, type ResultPreview, type ResultTemplate, type ValueFormat } from "@/lib/sites/quiz-schema";
import { RESULT_PRESETS, neutralForTemplate, resultPreset, type ResultPresetId } from "@/lib/sites/result-presets";

const field = "h-11 w-full rounded-xl border border-[#e4e4e7] bg-[#fff] px-3 text-sm text-[#09090b] outline-none";
const TEMPLATES: Array<{ id: ResultTemplate; label: string }> = [
  { id: "financial_forecast", label: "Финансовый прогноз" },
  { id: "estimate_breakdown", label: "Смета / Цена" },
  { id: "curated_match", label: "Подборка вариантов" },
  { id: "diagnostic_audit", label: "Аудит / Индекс" },
];

export function ResultInspector({ siteId, title, draft, onChange }: { siteId: string; title: string; draft: QuizSchema; onChange: (draft: QuizSchema) => void }) {
  const preview = draft.resultPreview ?? disabledResult();
  const [slot, setSlot] = useState<{ value: string; commit: (value: string) => void; formula: boolean } | null>(null);
  const [adapting, setAdapting] = useState(false);
  const [adaptError, setAdaptError] = useState("");
  const memory = useRef<Partial<Record<ResultTemplate, ResultPreview>>>({});
  const keys = [...new Set([...draft.steps.map((step) => step.variableKey).filter((item): item is string => Boolean(item)), ...Object.keys(preview.sampleDefaults ?? {})])];
  const primaryKey = draft.steps.find((step) => step.variableKey)?.variableKey || "budget";

  function commit(next: ResultPreview, leadHeadline?: string) {
    const lead = leadHeadline ? { ...draft.leadScreen, headline: leadHeadline } : draft.leadScreen;
    onChange({ ...draft, resultPreview: next, leadScreen: lead });
  }

  function enable(checked: boolean) {
    if (!checked) {
      commit({ ...preview, enabled: false });
      return;
    }
    const empty = preview.kpis.length === 0 && !preview.table && !preview.matches && !preview.audit;
    const next = empty ? { ...neutralForTemplate(preview.template, primaryKey, preview.currency), enabled: true } : { ...preview, enabled: true };
    const headline = draft.leadScreen.headline === "Куда отправить результат?" ? "Куда прислать полный расчёт?" : undefined;
    commit(next, headline);
  }

  function chooseTemplate(template: ResultTemplate) {
    if (template === preview.template) return;
    memory.current[preview.template] = preview;
    const saved = memory.current[template];
    const next = saved ?? neutralForTemplate(template, primaryKey, preview.currency);
    commit({ ...next, enabled: true, currency: preview.currency, revealFullResultOnThankYou: preview.revealFullResultOnThankYou, loader: preview.loader });
  }

  async function adapt() {
    setAdapting(true);
    setAdaptError("");
    try {
      const response = await fetch("/api/sites/adapt-result-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteId,
          template: preview.template,
          title,
          nicheContext: `${title}. ${draft.startScreen.subheadline.text}`,
          questions: draft.steps.map((step) => ({
            title: step.title,
            variableKey: step.variableKey,
            options: step.options.map((option) => ({ label: option.label, numericValue: option.numericValue })),
          })),
          currency: preview.currency,
        }),
      });
      const body = (await response.json()) as { resultPreview?: ResultPreview; error?: string };
      if (!response.ok || !body.resultPreview) throw new Error(body.error || "Не удалось адаптировать превью.");
      const next = { ...body.resultPreview, enabled: true, revealFullResultOnThankYou: preview.revealFullResultOnThankYou };
      memory.current[next.template] = next;
      commit(next);
    } catch (error) {
      setAdaptError(error instanceof Error ? error.message : "Не удалось адаптировать превью.");
    } finally {
      setAdapting(false);
    }
  }

  function applyPreset(id: ResultPresetId) {
    const dirty = preview.kpis.length > 0 || preview.table || preview.matches || preview.audit;
    if (dirty && !window.confirm("Заменить текущее превью этим пресетом?")) return;
    commit({ ...resultPreset(id, preview.currency.symbol), enabled: true, currency: preview.currency, revealFullResultOnThankYou: preview.revealFullResultOnThankYou });
  }

  function bind(value: string, commitValue: (value: string) => void, formula = false) {
    return {
      value,
      onFocus: () => setSlot({ value, commit: commitValue, formula }),
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        commitValue(event.target.value);
        setSlot({ value: event.target.value, commit: commitValue, formula });
      },
    };
  }

  return (
    <div className="grid gap-3 border-t border-[#e4e4e7] pt-3">
      <StudioToggle label="Превью результата и калькулятор" checked={preview.enabled} onChange={enable} />
      {preview.enabled ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((item) => (
              <button key={item.id} type="button" className="rounded-xl border px-2 py-2 text-left text-xs" style={{ borderColor: preview.template === item.id ? "#cf0234" : "#e4e4e7", color: "#09090b" }} onClick={() => chooseTemplate(item.id)}>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <button type="button" disabled={adapting} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#09090b] px-3 text-sm font-medium text-[#fff] disabled:opacity-60" onClick={() => void adapt()}>
            {adapting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{adapting ? "Адаптируем…" : "✨ Адаптировать под нишу с ИИ"}</span>
          </button>
          {adaptError ? <p className="text-xs text-[#b91c1c]"><span>{adaptError}</span></p> : null}
          <label className="grid gap-1 text-xs text-[#52525b]">
            <span>Быстрый пресет ниши</span>
            <StudioSelect ariaLabel="Пресет ниши" value="" onChange={(value) => { if (value) applyPreset(value as ResultPresetId); }} options={[{ value: "", label: "Выбрать пресет" }, ...RESULT_PRESETS.map((item) => ({ value: item.id, label: item.label }))]} />
          </label>
          <div className="flex gap-2">
            {["₸", "$", "€", "₽"].map((symbol) => (
              <button key={symbol} type="button" className="h-9 flex-1 rounded-lg border text-sm" style={{ borderColor: preview.currency.symbol === symbol ? "#cf0234" : "#e4e4e7" }} onClick={() => commit({ ...preview, currency: { ...preview.currency, symbol, position: symbol === "₸" || symbol === "₽" ? "after" : "before" } })}>
                <span>{symbol}</span>
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-xs text-[#52525b]">
            <span>Свой символ</span>
            <input className={field} value={preview.currency.symbol} onChange={(event) => commit({ ...preview, currency: { ...preview.currency, symbol: event.target.value.slice(0, 8) } })} />
          </label>
          <label className="grid gap-1 text-xs text-[#52525b]">
            <span>Позиция символа</span>
            <StudioSelect ariaLabel="Позиция символа" value={preview.currency.position} onChange={(position) => commit({ ...preview, currency: { ...preview.currency, position: position === "after" ? "after" : "before" } })} options={[{ value: "before", label: "Перед суммой" }, { value: "after", label: "После суммы" }]} />
          </label>
          <Field label="Надзаголовок" {...bind(preview.eyebrow, (eyebrow) => commit({ ...preview, eyebrow }))} />
          <Field label="Заголовок результата" {...bind(preview.defaultHeadline, (defaultHeadline) => commit({ ...preview, defaultHeadline }))} />
          <Field label="Описание" {...bind(preview.defaultDescription, (defaultDescription) => commit({ ...preview, defaultDescription }))} />
          <Field label="Текст замка" {...bind(preview.lockBadgeText, (lockBadgeText) => commit({ ...preview, lockBadgeText }))} />
          <Field label="Сноска" {...bind(preview.footnote, (footnote) => commit({ ...preview, footnote }))} />
          <Chips keys={keys} slot={slot} />
          {preview.template !== "curated_match" && preview.template !== "diagnostic_audit" ? (
            <KpiEditor preview={preview} onChange={commit} bind={bind} />
          ) : null}
          {preview.table && (preview.template === "financial_forecast" || preview.template === "estimate_breakdown") ? (
            <RowsEditor preview={preview} onChange={commit} bind={bind} />
          ) : null}
          {preview.matches && preview.template === "curated_match" ? <MatchEditor siteId={siteId} preview={preview} onChange={commit} bind={bind} /> : null}
          {preview.audit && preview.template === "diagnostic_audit" ? <AuditEditor preview={preview} onChange={commit} bind={bind} /> : null}
          <details className="rounded-xl border border-[#e4e4e7] p-3">
            <summary className="cursor-pointer text-sm"><span>Менять заголовок и ставки по ответам</span></summary>
            <RulesEditor preview={preview} onChange={commit} keys={keys} />
          </details>
          <StudioToggle label="Лоадер расчёта" checked={preview.loader.enabled} onChange={(enabled) => commit({ ...preview, loader: { ...preview.loader, enabled } })} />
          {preview.loader.steps.map((step, index) => (
            <Field key={index} label={`Статус ${index + 1}`} value={step} onChange={(event) => {
              const steps = preview.loader.steps.map((item, itemIndex) => itemIndex === index ? event.target.value : item);
              commit({ ...preview, loader: { ...preview.loader, steps } });
            }} />
          ))}
          <StudioToggle label="Снимать блюр после отправки" checked={preview.revealFullResultOnThankYou} onChange={(revealFullResultOnThankYou) => commit({ ...preview, revealFullResultOnThankYou })} />
        </>
      ) : null}
    </div>
  );
}

function Chips({ keys, slot }: { keys: string[]; slot: { value: string; commit: (value: string) => void; formula: boolean } | null }) {
  if (keys.length === 0) return <p className="text-[11px] text-[#71717a]"><span>Задайте ключ переменной в вопросе, например budget.</span></p>;
  return (
    <div className="grid gap-1.5">
      <p className="text-[11px] text-[#71717a]"><span>Переменные из вопросов (клик — вставить):</span></p>
      <div className="flex flex-wrap gap-1.5">
      {keys.map((key) => (
        <button key={key} type="button" className="rounded-full border border-[#e4e4e7] px-2 py-1 text-[11px]" onClick={() => {
          if (!slot) return;
          const token = slot.formula ? key : `{{${key}}}`;
          const glue = slot.value && !slot.value.endsWith(" ") && !slot.value.endsWith("=") ? " " : "";
          slot.commit(`${slot.value}${glue}${token}`);
        }}>
          <span>{key}</span>
        </button>
      ))}
      </div>
    </div>
  );
}

function KpiEditor({ preview, onChange, bind }: { preview: ResultPreview; onChange: (next: ResultPreview) => void; bind: (value: string, commit: (value: string) => void, formula?: boolean) => { value: string; onFocus: () => void; onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void } }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#52525b]"><span>KPI-карточки</span></p>
        {preview.kpis.length < 3 ? <button type="button" className="text-xs text-[#cf0234]" onClick={() => onChange({ ...preview, kpis: [...preview.kpis, { id: `k-${Date.now()}`, valueExpr: "=budget", label: "Показатель", format: "currency" }] })}><span>Добавить</span></button> : null}
      </div>
      {preview.kpis.map((item, index) => (
        <div key={item.id} className="grid gap-2 rounded-xl border border-[#e4e4e7] p-2">
          <Field label="Формула" {...bind(item.valueExpr, (valueExpr) => updateKpi(preview, onChange, index, { valueExpr }), true)} />
          <Field label="Подпись" {...bind(item.label, (label) => updateKpi(preview, onChange, index, { label }))} />
          <div className="flex gap-2">
            <StudioSelect ariaLabel="Формат KPI" value={item.format} onChange={(format) => updateKpi(preview, onChange, index, { format: format as ValueFormat })} options={[{ value: "currency", label: "Валюта" }, { value: "percent", label: "Процент" }, { value: "number", label: "Число" }, { value: "text", label: "Текст" }]} />
            <button type="button" className="text-xs text-[#cf0234]" onClick={() => onChange({ ...preview, kpis: preview.kpis.filter((_, itemIndex) => itemIndex !== index) })}><span>Удалить</span></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function updateKpi(preview: ResultPreview, onChange: (next: ResultPreview) => void, index: number, patch: Partial<ResultPreview["kpis"][number]>) {
  onChange({ ...preview, kpis: preview.kpis.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
}

function RowsEditor({ preview, onChange, bind }: { preview: ResultPreview; onChange: (next: ResultPreview) => void; bind: (value: string, commit: (value: string) => void, formula?: boolean) => { value: string; onFocus: () => void; onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void } }) {
  const table = preview.table;
  if (!table) return null;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-[#52525b]"><span>Строки таблицы</span></p>
        <button type="button" className="text-xs text-[#cf0234]" onClick={() => {
          const cells = Object.fromEntries(table.columns.map((column) => [column.key, column.format === "text" ? "Новая строка" : "=budget"]));
          onChange({ ...preview, table: { ...table, rows: [...table.rows, { id: `row-${Date.now()}`, cells, locked: true }] } });
        }}><span>+ Строка</span></button>
      </div>
      <div className="grid gap-2">
        {table.columns.map((column, index) => (
          <Field key={column.key} label={`Колонка ${index + 1}`} value={column.label} onChange={(event) => {
            const columns = table.columns.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item);
            onChange({ ...preview, table: { ...table, columns } });
          }} />
        ))}
      </div>
      {table.rows.map((row, index) => (
        <div key={row.id} className="grid gap-2 rounded-xl border border-[#e4e4e7] p-2">
          {table.columns.map((column) => (
            <label key={column.key} className="grid gap-1 text-[11px] text-[#71717a]">
              <span>{column.label}</span>
              <input className={field} {...bind(row.cells[column.key] ?? "", (value) => {
                const rows = table.rows.map((item, itemIndex) => itemIndex === index ? { ...item, cells: { ...item.cells, [column.key]: value } } : item);
                onChange({ ...preview, table: { ...table, rows } });
              }, column.format !== "text")} />
            </label>
          ))}
          <div className="flex items-center justify-between">
            <StudioToggle label="Скрыть под блюром" checked={row.locked} onChange={(locked) => {
              const rows = table.rows.map((item, itemIndex) => itemIndex === index ? { ...item, locked } : item);
              onChange({ ...preview, table: { ...table, rows } });
            }} />
            <button type="button" aria-label="Удалить строку" className="text-[#71717a]" onClick={() => onChange({ ...preview, table: { ...table, rows: table.rows.filter((_, itemIndex) => itemIndex !== index) } })}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchEditor({ siteId, preview, onChange, bind }: { siteId: string; preview: ResultPreview; onChange: (next: ResultPreview) => void; bind: (value: string, commit: (value: string) => void, formula?: boolean) => { value: string; onFocus: () => void; onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void } }) {
  const matches = preview.matches;
  const [uploadError, setUploadError] = useState("");
  if (!matches) return null;
  return (
    <div className="grid gap-2">
      <Field label="Бейдж подборки" {...bind(matches.badgeText, (badgeText) => onChange({ ...preview, matches: { ...matches, badgeText } }))} />
      {matches.items.map((item, index) => (
        <div key={item.id} className="grid gap-2 rounded-xl border border-[#e4e4e7] p-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-[#71717a]"><span>{`Вариант ${String(index + 1).padStart(2, "0")}`}</span></p>
            <button type="button" aria-label="Удалить вариант" className="text-[#71717a]" onClick={() => onChange({ ...preview, matches: { ...matches, items: matches.items.filter((_, itemIndex) => itemIndex !== index) } })}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <Field label="Название" {...bind(item.title, (title) => updateMatch(preview, onChange, index, { title }))} />
          <Field label="Подзаголовок / параметры" {...bind(item.subtitle, (subtitle) => updateMatch(preview, onChange, index, { subtitle }))} />
          <Field label="Цена / формула" {...bind(item.priceExpr, (priceExpr) => updateMatch(preview, onChange, index, { priceExpr }), true)} />
          <label className="grid gap-1 text-xs text-[#52525b]">
            <span>Фото</span>
            <input className={field} type="file" accept="image/*" onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void uploadMatch(siteId, file, setUploadError, (url) => updateMatch(preview, onChange, index, { imageUrl: url }));
            }} />
          </label>
          {item.imageUrl ? (
            <button type="button" className="text-left text-xs text-[#cf0234]" onClick={() => updateMatch(preview, onChange, index, { imageUrl: null })}><span>Удалить фото</span></button>
          ) : null}
          <StudioToggle label="Скрыть под блюром" checked={item.locked} onChange={(locked) => updateMatch(preview, onChange, index, { locked })} />
        </div>
      ))}
      {matches.items.length < 4 ? (
        <button type="button" className="text-left text-xs text-[#cf0234]" onClick={() => onChange({
          ...preview,
          matches: { ...matches, items: [...matches.items, { id: `m-${Date.now()}`, title: "Новый вариант", subtitle: "Параметры", priceExpr: "=budget", metricText: "", imageUrl: null, locked: true }] },
        })}><span>+ Добавить вариант</span></button>
      ) : null}
      {uploadError ? <p className="text-xs text-[#b91c1c]"><span>{uploadError}</span></p> : null}
    </div>
  );
}

async function uploadMatch(siteId: string, file: File, setError: (value: string) => void, apply: (url: string) => void) {
  setError("");
  const body = new FormData();
  body.set("file", file);
  body.set("siteId", siteId);
  body.set("kind", "match_image");
  const response = await fetch("/api/sites/upload-asset", { method: "POST", body });
  const payload = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || !payload.url) {
    setError(payload.error || "Не удалось загрузить фото.");
    return;
  }
  apply(payload.url);
}

function updateMatch(preview: ResultPreview, onChange: (next: ResultPreview) => void, index: number, patch: Partial<NonNullable<ResultPreview["matches"]>["items"][number]>) {
  if (!preview.matches) return;
  onChange({ ...preview, matches: { ...preview.matches, items: preview.matches.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) } });
}

function AuditEditor({ preview, onChange, bind }: { preview: ResultPreview; onChange: (next: ResultPreview) => void; bind: (value: string, commit: (value: string) => void, formula?: boolean) => { value: string; onFocus: () => void; onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void } }) {
  const audit = preview.audit;
  if (!audit) return null;
  return (
    <div className="grid gap-2">
      <Field label="Формула индекса" {...bind(audit.scoreExpr, (scoreExpr) => onChange({ ...preview, audit: { ...audit, scoreExpr } }), true)} />
      <Field label="Подпись индекса" {...bind(audit.scoreLabel, (scoreLabel) => onChange({ ...preview, audit: { ...audit, scoreLabel } }))} />
      <Field label="Эффект" {...bind(audit.impactExpr, (impactExpr) => onChange({ ...preview, audit: { ...audit, impactExpr } }))} />
      {audit.insights.map((item, index) => (
        <div key={item.id} className="grid gap-2 rounded-xl border border-[#e4e4e7] p-2">
          <Field label="Пункт" {...bind(item.title, (title) => {
            const insights = audit.insights.map((entry, entryIndex) => entryIndex === index ? { ...entry, title } : entry);
            onChange({ ...preview, audit: { ...audit, insights } });
          })} />
          <Field label="Пояснение" {...bind(item.detail, (detail) => {
            const insights = audit.insights.map((entry, entryIndex) => entryIndex === index ? { ...entry, detail } : entry);
            onChange({ ...preview, audit: { ...audit, insights } });
          })} />
          <div className="flex items-center justify-between">
            <StudioToggle label="Скрыть под блюром" checked={item.locked} onChange={(locked) => {
              const insights = audit.insights.map((entry, entryIndex) => entryIndex === index ? { ...entry, locked } : entry);
              onChange({ ...preview, audit: { ...audit, insights } });
            }} />
            <button type="button" aria-label="Удалить пункт" className="text-[#71717a]" onClick={() => onChange({ ...preview, audit: { ...audit, insights: audit.insights.filter((_, entryIndex) => entryIndex !== index) } })}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
      {audit.insights.length < 5 ? (
        <button type="button" className="text-left text-xs text-[#cf0234]" onClick={() => onChange({ ...preview, audit: { ...audit, insights: [...audit.insights, { id: `i-${Date.now()}`, title: "Новый пункт", detail: "", locked: true }] } })}>
          <span>+ Пункт аудита</span>
        </button>
      ) : null}
    </div>
  );
}

function RulesEditor({ preview, onChange, keys }: { preview: ResultPreview; onChange: (next: ResultPreview) => void; keys: string[] }) {
  return (
    <div className="mt-3 grid gap-2">
      {preview.rules.map((rule, index) => (
        <div key={rule.id} className="grid gap-2">
          <div className="grid grid-cols-3 gap-1">
            <input className={field} value={rule.variable} placeholder={keys[0] ?? "budget"} onChange={(event) => updateRule(preview, onChange, index, { variable: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} />
            <StudioSelect ariaLabel="Оператор" value={rule.operator} onChange={(operator) => updateRule(preview, onChange, index, { operator: operator as ResultPreview["rules"][number]["operator"] })} options={[{ value: "gte", label: ">=" }, { value: "gt", label: ">" }, { value: "lte", label: "<=" }, { value: "lt", label: "<" }, { value: "eq", label: "=" }]} />
            <input className={field} value={String(rule.value)} onChange={(event) => updateRule(preview, onChange, index, { value: Number(event.target.value) || 0 })} />
          </div>
          <input className={field} value={rule.eyebrow ?? ""} placeholder="Надзаголовок программы" onChange={(event) => updateRule(preview, onChange, index, { eyebrow: event.target.value })} />
          <input className={field} value={rule.headline} placeholder="Заголовок программы" onChange={(event) => updateRule(preview, onChange, index, { headline: event.target.value })} />
          <input className={field} value={rule.description} placeholder="Описание" onChange={(event) => updateRule(preview, onChange, index, { description: event.target.value })} />
          <input className={field} value={Object.entries(rule.overrideVariables ?? {}).map(([key, value]) => `${key}=${value}`).join(", ")} placeholder="rate=25.2" onChange={(event) => updateRule(preview, onChange, index, { overrideVariables: parseOverrides(event.target.value) })} />
        </div>
      ))}
      {preview.rules.length < 8 ? (
        <button type="button" className="text-left text-xs text-[#cf0234]" onClick={() => onChange({ ...preview, rules: [...preview.rules, { id: `r-${Date.now()}`, variable: keys[0] ?? "budget", operator: "gte", value: 0, headline: "", description: "" }] })}>
          <span>Добавить правило</span>
        </button>
      ) : null}
    </div>
  );
}

function updateRule(preview: ResultPreview, onChange: (next: ResultPreview) => void, index: number, patch: Partial<ResultPreview["rules"][number]>) {
  onChange({ ...preview, rules: preview.rules.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
}

function parseOverrides(value: string) {
  const overrides: Record<string, number> = {};
  for (const part of value.split(",")) {
    const [key, raw] = part.split("=").map((item) => item.trim());
    const name = (key ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "");
    const parsed = Number(raw);
    if (name && Number.isFinite(parsed)) overrides[name] = parsed;
  }
  return overrides;
}

function Field({ label, ...props }: { label: string; value: string; onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void; onFocus?: () => void }) {
  return (
    <label className="grid gap-1 text-xs text-[#52525b]">
      <span>{label}</span>
      <input className={field} {...props} />
    </label>
  );
}
