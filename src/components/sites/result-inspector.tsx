"use client";

import { useState, type ChangeEvent } from "react";

import { disabledResult, type QuizSchema, type ResultPreview, type ResultTemplate, type ValueFormat } from "@/lib/sites/quiz-schema";
import { RESULT_PRESETS, resultPreset, presetForTemplate, type ResultPresetId } from "@/lib/sites/result-presets";

const field = "h-11 w-full rounded-xl border border-[#e4e4e7] bg-[#fff] px-3 text-sm text-[#09090b] outline-none";
const TEMPLATES: Array<{ id: ResultTemplate; label: string }> = [
  { id: "financial_forecast", label: "Финансовый прогноз" },
  { id: "estimate_breakdown", label: "Смета / Цена" },
  { id: "curated_match", label: "Подборка вариантов" },
  { id: "diagnostic_audit", label: "Аудит / Индекс" },
];

export function ResultInspector({ draft, onChange }: { draft: QuizSchema; onChange: (draft: QuizSchema) => void }) {
  const preview = draft.resultPreview ?? disabledResult();
  const [slot, setSlot] = useState<{ value: string; commit: (value: string) => void; formula: boolean } | null>(null);
  const keys = [...new Set([...draft.steps.map((step) => step.variableKey).filter((item): item is string => Boolean(item)), ...Object.keys(preview.sampleDefaults ?? {})])];

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
    const next = empty ? { ...resultPreset("real_estate_yield"), enabled: true } : { ...preview, enabled: true };
    const headline = draft.leadScreen.headline === "Куда отправить результат?" ? "Куда прислать полный расчёт?" : undefined;
    commit(next, headline);
  }

  function chooseTemplate(template: ResultTemplate) {
    const next = presetForTemplate(template);
    commit({ ...next, enabled: true, currency: preview.currency, revealFullResultOnThankYou: preview.revealFullResultOnThankYou, loader: preview.loader });
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
      <label className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span>Превью результата и калькулятор</span>
        <input type="checkbox" checked={preview.enabled} onChange={(event) => enable(event.target.checked)} />
      </label>
      {preview.enabled ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map((item) => (
              <button key={item.id} type="button" className="rounded-xl border px-2 py-2 text-left text-xs" style={{ borderColor: preview.template === item.id ? "#cf0234" : "#e4e4e7", color: "#09090b" }} onClick={() => chooseTemplate(item.id)}>
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-xs text-[#52525b]">
            <span>Быстрый пресет ниши</span>
            <select className={field} value="" onChange={(event) => { if (event.target.value) applyPreset(event.target.value as ResultPresetId); }}>
              <option value="">Выбрать пресет</option>
              {RESULT_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
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
            <select className={field} value={preview.currency.position} onChange={(event) => commit({ ...preview, currency: { ...preview.currency, position: event.target.value === "after" ? "after" : "before" } })}>
              <option value="before">Перед суммой</option>
              <option value="after">После суммы</option>
            </select>
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
          {preview.matches && preview.template === "curated_match" ? <MatchEditor preview={preview} onChange={commit} bind={bind} /> : null}
          {preview.audit && preview.template === "diagnostic_audit" ? <AuditEditor preview={preview} onChange={commit} bind={bind} /> : null}
          <details className="rounded-xl border border-[#e4e4e7] p-3">
            <summary className="cursor-pointer text-sm"><span>Менять заголовок и ставки по ответам</span></summary>
            <RulesEditor preview={preview} onChange={commit} keys={keys} />
          </details>
          <label className="flex items-center justify-between text-sm">
            <span>Лоадер расчёта</span>
            <input type="checkbox" checked={preview.loader.enabled} onChange={(event) => commit({ ...preview, loader: { ...preview.loader, enabled: event.target.checked } })} />
          </label>
          {preview.loader.steps.map((step, index) => (
            <Field key={index} label={`Статус ${index + 1}`} value={step} onChange={(event) => {
              const steps = preview.loader.steps.map((item, itemIndex) => itemIndex === index ? event.target.value : item);
              commit({ ...preview, loader: { ...preview.loader, steps } });
            }} />
          ))}
          <label className="flex items-start justify-between gap-3 text-sm">
            <span>Снимать блюр и показывать полный расчёт на странице после отправки</span>
            <input type="checkbox" checked={preview.revealFullResultOnThankYou} onChange={(event) => commit({ ...preview, revealFullResultOnThankYou: event.target.checked })} />
          </label>
        </>
      ) : null}
    </div>
  );
}

function Chips({ keys, slot }: { keys: string[]; slot: { value: string; commit: (value: string) => void; formula: boolean } | null }) {
  if (keys.length === 0) return <p className="text-[11px] text-[#71717a]"><span>Задайте ключ переменной в вопросе, например budget.</span></p>;
  return (
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
          <input className={field} {...bind(item.valueExpr, (valueExpr) => updateKpi(preview, onChange, index, { valueExpr }), true)} />
          <input className={field} {...bind(item.label, (label) => updateKpi(preview, onChange, index, { label }))} />
          <div className="flex gap-2">
            <select className={field} value={item.format} onChange={(event) => updateKpi(preview, onChange, index, { format: event.target.value as ValueFormat })}>
              <option value="currency">Валюта</option>
              <option value="percent">Процент</option>
              <option value="number">Число</option>
              <option value="text">Текст</option>
            </select>
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
      <p className="text-xs font-medium text-[#52525b]"><span>Строки таблицы</span></p>
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
          <label className="flex items-center justify-between text-xs">
            <span>Скрыть под блюром</span>
            <input type="checkbox" checked={row.locked} onChange={(event) => {
              const rows = table.rows.map((item, itemIndex) => itemIndex === index ? { ...item, locked: event.target.checked } : item);
              onChange({ ...preview, table: { ...table, rows } });
            }} />
          </label>
        </div>
      ))}
    </div>
  );
}

function MatchEditor({ preview, onChange, bind }: { preview: ResultPreview; onChange: (next: ResultPreview) => void; bind: (value: string, commit: (value: string) => void, formula?: boolean) => { value: string; onFocus: () => void; onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void } }) {
  const matches = preview.matches;
  if (!matches) return null;
  return (
    <div className="grid gap-2">
      <Field label="Бейдж подборки" {...bind(matches.badgeText, (badgeText) => onChange({ ...preview, matches: { ...matches, badgeText } }))} />
      {matches.items.map((item, index) => (
        <div key={item.id} className="grid gap-2 rounded-xl border border-[#e4e4e7] p-2">
          <input className={field} {...bind(item.title, (title) => updateMatch(preview, onChange, index, { title }))} />
          <input className={field} {...bind(item.priceExpr, (priceExpr) => updateMatch(preview, onChange, index, { priceExpr }), true)} />
          <label className="flex items-center justify-between text-xs">
            <span>Скрыть под блюром</span>
            <input type="checkbox" checked={item.locked} onChange={(event) => updateMatch(preview, onChange, index, { locked: event.target.checked })} />
          </label>
        </div>
      ))}
    </div>
  );
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
      <Field label="Эффект" {...bind(audit.impactExpr, (impactExpr) => onChange({ ...preview, audit: { ...audit, impactExpr } }))} />
      {audit.insights.map((item, index) => (
        <div key={item.id} className="grid gap-2 rounded-xl border border-[#e4e4e7] p-2">
          <input className={field} {...bind(item.title, (title) => {
            const insights = audit.insights.map((entry, entryIndex) => entryIndex === index ? { ...entry, title } : entry);
            onChange({ ...preview, audit: { ...audit, insights } });
          })} />
          <label className="flex items-center justify-between text-xs">
            <span>Скрыть под блюром</span>
            <input type="checkbox" checked={item.locked} onChange={(event) => {
              const insights = audit.insights.map((entry, entryIndex) => entryIndex === index ? { ...entry, locked: event.target.checked } : entry);
              onChange({ ...preview, audit: { ...audit, insights } });
            }} />
          </label>
        </div>
      ))}
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
            <select className={field} value={rule.operator} onChange={(event) => updateRule(preview, onChange, index, { operator: event.target.value as ResultPreview["rules"][number]["operator"] })}>
              <option value="gte">&gt;=</option>
              <option value="gt">&gt;</option>
              <option value="lte">&lt;=</option>
              <option value="lt">&lt;</option>
              <option value="eq">=</option>
            </select>
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
