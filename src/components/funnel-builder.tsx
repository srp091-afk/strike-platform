"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Check, House, Ruler, TrendingUp } from "lucide-react";

import { FunnelPreview } from "@/components/funnel-preview";
import { Button } from "@/components/ui/button";
import {
  funnelPublicUrl,
  getFunnelTemplate,
  personalizeWelcome,
  type FunnelTemplate,
  FUNNEL_TEMPLATES,
} from "@/lib/funnel-templates";
import { cn } from "@/lib/utils";

const fieldClass =
  "w-full rounded-xl border border-transparent bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 hover:bg-zinc-100/80 focus:border-zinc-300 focus:bg-white";

const templateIcons = {
  fitout: Ruler,
  villa: House,
  roi: TrendingUp,
} as const;

type AgentOption = {
  id: string;
  name: string;
};

type Draft = {
  templateId: string;
  agentId: string;
  welcome: string;
  utmCampaign: string;
  utmContent: string;
  carousel: boolean;
  budget: boolean;
  area: boolean;
  phone: string;
  messageTemplate: string;
};

export function FunnelBuilder({
  agents,
  loadError,
}: {
  agents: AgentOption[];
  loadError: string | null;
}) {
  const [draft, setDraft] = useState<Draft>(() =>
    draftFromTemplate(FUNNEL_TEMPLATES[1], agents[0]?.id ?? ""),
  );
  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const template = getFunnelTemplate(draft.templateId);
  const agentName = agents.find((agent) => agent.id === draft.agentId)?.name ?? "STRIKE";
  const welcome = useMemo(
    () => personalizeWelcome(draft.welcome, draft.utmCampaign, draft.utmContent),
    [draft.welcome, draft.utmCampaign, draft.utmContent],
  );
  const widgets = useMemo(
    () => ({ carousel: draft.carousel, budget: draft.budget, area: draft.area }),
    [draft.carousel, draft.budget, draft.area],
  );

  function applyTemplate(next: FunnelTemplate) {
    setDraft((current) => draftFromTemplate(next, current.agentId));
    setPublicLink(null);
    setCopied(false);
    document.getElementById("funnel-builder")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveLink() {
    const url = funnelPublicUrl(template.slug, {
      utmCampaign: draft.utmCampaign,
      utmContent: draft.utmContent,
      agentId: draft.agentId,
    });
    setPublicLink(url);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      {loadError ? (
        <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold">Шаблоны</h2>
        <p className="mt-1 text-sm text-zinc-500">Start from Template — клик загружает сценарий в конструктор.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {FUNNEL_TEMPLATES.map((item) => {
            const Icon = templateIcons[item.id as keyof typeof templateIcons] ?? House;
            const selected = item.id === template.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => applyTemplate(item)}
                className={cn(
                  "rounded-2xl border bg-white p-5 text-left shadow-sm transition-all duration-200 hover:shadow-md",
                  selected ? "border-red-200 ring-2 ring-strike/20" : "border-zinc-200/80",
                )}
              >
                <span className="inline-flex rounded-xl bg-red-50 p-2.5 text-red-600">
                  <Icon className="size-5" strokeWidth={2} />
                </span>
                <span className="mt-4 block font-heading text-base font-semibold tracking-tight text-zinc-900">
                  {item.title}
                </span>
                <span className="mt-1 block text-sm leading-6 text-zinc-500">{item.summary}</span>
                <span className="mt-3 block text-xs font-semibold text-strike">
                  {selected ? "В конструкторе" : "Открыть"}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section id="funnel-builder" className="mt-10 scroll-mt-24">
        <h2 className="text-lg font-semibold">Конструктор</h2>
        <div className="mt-4 grid items-start gap-6 lg:grid-cols-5">
          <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm lg:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Предпросмотр</p>
            <p className="mt-1 text-sm text-zinc-500">Так воронку увидит клиент.</p>
            <div className="mt-5">
              <FunnelPreview
                key={template.id}
                agentName={agentName}
                welcome={welcome}
                widgets={widgets}
                styles={template.styles}
                budgets={template.budgets}
                areas={template.areas}
                phone={draft.phone}
                messageTemplate={draft.messageTemplate}
              />
            </div>
          </div>

          <div className="grid gap-4 lg:col-span-3">
            <SettingsCard title="Агент" text="Этот агент ведёт диалог на посадочной.">
              <label className="grid gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Из базы</span>
                <select
                  className={fieldClass}
                  value={draft.agentId}
                  onChange={(event) => setDraft((current) => ({ ...current, agentId: event.target.value }))}
                >
                  {agents.length === 0 ? <option value="">Нет агентов</option> : null}
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
            </SettingsCard>

            <SettingsCard
              title="UTM-снайпер"
              text="Токены #UTM_CAMPAIGN и #UTM_CONTENT подставляются в приветствие. Ниже — значения для живого предпросмотра."
            >
              <label className="grid gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Приветствие</span>
                <textarea
                  className={`${fieldClass} min-h-24 resize-y`}
                  value={draft.welcome}
                  onChange={(event) => setDraft((current) => ({ ...current, welcome: event.target.value }))}
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">utm_campaign</span>
                  <input
                    className={fieldClass}
                    value={draft.utmCampaign}
                    onChange={(event) => setDraft((current) => ({ ...current, utmCampaign: event.target.value }))}
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">utm_content</span>
                  <input
                    className={fieldClass}
                    value={draft.utmContent}
                    onChange={(event) => setDraft((current) => ({ ...current, utmContent: event.target.value }))}
                  />
                </label>
              </div>
            </SettingsCard>

            <SettingsCard title="Rich-UI" text="Включённые блоки сразу появляются в мокапе.">
              <Toggle
                label="Карусель референсов"
                checked={draft.carousel}
                onChange={(carousel) => setDraft((current) => ({ ...current, carousel }))}
              />
              <Toggle
                label="Кнопки выбора бюджета"
                checked={draft.budget}
                onChange={(budget) => setDraft((current) => ({ ...current, budget }))}
              />
              <Toggle
                label="Калькулятор площади"
                checked={draft.area}
                onChange={(area) => setDraft((current) => ({ ...current, area }))}
              />
            </SettingsCard>

            <SettingsCard title="WhatsApp-Shift" text="Финальная кнопка переносит диалог в WhatsApp с уже выбранным контекстом.">
              <label className="grid gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Номер WhatsApp</span>
                <input
                  className={fieldClass}
                  inputMode="tel"
                  value={draft.phone}
                  onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="971500000000"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                  Шаблон сообщения
                </span>
                <textarea
                  className={`${fieldClass} min-h-24 resize-y`}
                  value={draft.messageTemplate}
                  onChange={(event) => setDraft((current) => ({ ...current, messageTemplate: event.target.value }))}
                />
                <span className="text-xs text-zinc-400">Токены: #STYLE, #BUDGET, #AREA</span>
              </label>
            </SettingsCard>

            <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
              <Button type="button" className="w-full" onClick={saveLink}>
                Сохранить и получить ссылку
              </Button>
              {publicLink ? (
                <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-strike-dark">
                    <Check className="size-3.5" strokeWidth={2.5} />
                    {copied ? "Ссылка скопирована" : "Публичная ссылка"}
                  </p>
                  <p className="mt-2 break-all text-sm leading-6 text-zinc-700">{publicLink}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function draftFromTemplate(template: FunnelTemplate, agentId: string): Draft {
  return {
    templateId: template.id,
    agentId,
    welcome: template.welcome,
    utmCampaign: template.previewCampaign,
    utmContent: template.previewContent,
    carousel: template.widgets.carousel,
    budget: template.widgets.budget,
    area: template.widgets.area,
    phone: template.whatsappPhone,
    messageTemplate: template.whatsappTemplate,
  };
}

function SettingsCard({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm">
      <div>
        <h3 className="font-heading text-base font-semibold text-zinc-900">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-zinc-500">{text}</p>
      </div>
      {children}
    </section>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-zinc-50 px-4 py-3">
      <span className="text-sm text-zinc-800">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-[#cf0234]"
      />
    </label>
  );
}
