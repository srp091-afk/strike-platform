"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { QuizRunner } from "@/components/sites/quiz-runner";
import { StartInspector } from "@/components/sites/start-inspector";
import { ResultInspector } from "@/components/sites/result-inspector";
import { ConsultantSettings, HelperInspector } from "@/components/sites/consultant-inspector";
import { listSubmissions, publishQuizSite, saveQuiz } from "@/app/funnels/site-actions";
import { brandHost, normalizeCustomDomain, normalizeSubdomain, publicSiteUrl, fallbackSitePath } from "@/lib/sites/domains";
import { newStep, type AnalyticsConfig, type QuizSchema, type SeoConfig, type ThemeConfig } from "@/lib/sites/quiz-schema";
import { THEME_LABEL } from "@/lib/sites/theme";

type StudioSite = {
  id: string;
  title: string;
  subdomain: string | null;
  customDomain: string | null;
  leads: number;
  draft: QuizSchema;
  theme: ThemeConfig;
  analytics: AnalyticsConfig;
  seo: SeoConfig;
  agentId: string | null;
};

type Panel = "flow" | "design" | "settings";
type Screen = "start" | "lead" | "thanks" | string;

const field = "h-11 w-full rounded-xl border border-[#e4e4e7] bg-[#fff] px-3 text-sm text-[#09090b] outline-none";

export function QuizStudio({ site, agents }: { site: StudioSite; agents: { id: string; name: string }[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(site.title);
  const [draft, setDraft] = useState(site.draft);
  const [theme, setTheme] = useState(site.theme);
  const [analytics, setAnalytics] = useState(site.analytics);
  const [seo, setSeo] = useState(site.seo);
  const [agentId, setAgentId] = useState(site.agentId ?? "");
  const [subdomain, setSubdomain] = useState(site.subdomain ?? "");
  const [customDomain, setCustomDomain] = useState(site.customDomain ?? "");
  const [domainNote, setDomainNote] = useState("");
  const [panel, setPanel] = useState<Panel>("flow");
  const [screen, setScreen] = useState<Screen>("start");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [walk, setWalk] = useState(false);
  const [leadsOpen, setLeadsOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const [notice, setNotice] = useState("");
  const [leads, setLeads] = useState<Awaited<ReturnType<typeof listSubmissions>>>([]);
  const [testOpen, setTestOpen] = useState(false);
  const [testVars, setTestVars] = useState<Record<string, number>>({});
  const snapshot = useMemo(() => JSON.stringify({ title, draft, theme, analytics, seo, agentId, subdomain, customDomain }), [title, draft, theme, analytics, seo, agentId, subdomain, customDomain]);

  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => {
      void saveQuiz(site.id, { title, subdomain, customDomain, theme, draft, analytics, seo, agentId: agentId || null }).then((result) => {
        setSaved(result.ok);
        if (!result.ok && result.error) setNotice(result.error);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [snapshot, site.id, title, subdomain, customDomain, theme, draft, analytics, seo, agentId]);

  const step = draft.steps.find((item) => item.id === screen) ?? null;
  const liveHost = normalizeSubdomain(subdomain);
  const hostLabel = !subdomain.trim() ? "имя.strikeplatform.io" : liveHost.ok ? brandHost(liveHost.slug) : liveHost.reason;

  function updateStep(next: QuizSchema["steps"][number]) {
    setDraft((current) => ({ ...current, steps: current.steps.map((item) => (item.id === next.id ? next : item)) }));
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-[#fafafa] text-[#09090b]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#e4e4e7] bg-[#fff] px-4">
        <Link href="/funnels" className="text-sm text-[#52525b]"><span>← Сайты</span></Link>
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
        <button type="button" className="hidden items-center gap-2 rounded-full border border-[#e4e4e7] px-3 py-1 text-xs sm:inline-flex" onClick={() => { setPanel("settings"); }}>
          <span>{hostLabel}</span>
        </button>
        {liveHost.ok ? (
          <button type="button" className="text-xs text-[#cf0234]" onClick={() => void navigator.clipboard.writeText(publicSiteUrl(liveHost.slug))}>
            <span>Скопировать ссылку</span>
          </button>
        ) : null}
        <button type="button" className="text-xs text-[#52525b]" onClick={() => setDevice(device === "desktop" ? "mobile" : "desktop")}>
          <span>{device === "desktop" ? "Desktop" : "Mobile"}</span>
        </button>
        <button type="button" className="text-xs text-[#52525b]" onClick={() => { setLeadsOpen(true); void listSubmissions(site.id).then(setLeads); }}>
          <span>{`Заявки (${site.leads})`}</span>
        </button>
        <span className="text-xs text-[#71717a]"><span>{saved ? "Сохранено" : "Есть неопубликованные правки"}</span></span>
        <button type="button" className="h-9 rounded-xl bg-[#cf0234] px-4 text-sm font-semibold text-[#fff]" onClick={() => void publishQuizSite(site.id).then((result) => { setNotice(result.ok ? "Опубликовано" : result.error ?? ""); if (result.ok) router.refresh(); })}>
          <span>Опубликовать</span>
        </button>
      </header>
      {notice ? <p className="bg-[#fff] px-4 py-2 text-sm text-[#52525b]"><span>{notice}</span></p> : null}
      {leadsOpen ? (
        <Leads rows={leads} onClose={() => setLeadsOpen(false)} />
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className="overflow-y-auto border-r border-[#e4e4e7] bg-[#fff] p-4">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#f4f4f5] p-1 text-xs">
              {(["flow", "design", "settings"] as Panel[]).map((item) => (
                <button key={item} type="button" className={`rounded-lg py-2 ${panel === item ? "bg-[#fff] font-semibold" : "text-[#52525b]"}`} onClick={() => setPanel(item)}>
                  <span>{item === "flow" ? "Сценарий" : item === "design" ? "Дизайн" : "Настройки"}</span>
                </button>
              ))}
            </div>
            {panel === "flow" ? (
              <div className="mt-4 grid gap-2">
                <FlowButton active={screen === "start"} label="Старт" onClick={() => setScreen("start")} />
                <FlowButton active={screen === "gifts"} label="Подарки" onClick={() => setScreen("gifts")} />
                {draft.steps.map((item, index) => (
                  <div key={item.id} className="flex gap-1">
                    <FlowButton active={screen === item.id} label={`${String(index + 1).padStart(2, "0")} ${item.title}`} onClick={() => setScreen(item.id)} />
                    <button type="button" className="text-xs text-[#71717a]" onClick={() => move(index, -1)}><span>↑</span></button>
                    <button type="button" className="text-xs text-[#71717a]" onClick={() => move(index, 1)}><span>↓</span></button>
                  </div>
                ))}
                <FlowButton active={screen === "lead"} label="Контакт" onClick={() => setScreen("lead")} />
                <FlowButton active={screen === "thanks"} label="Спасибо" onClick={() => setScreen("thanks")} />
                <button type="button" className="mt-2 text-left text-sm text-[#cf0234]" onClick={() => { const created = newStep(draft.steps.length); setDraft({ ...draft, steps: [...draft.steps, created] }); setScreen(created.id); }}>
                  <span>+ Добавить вопрос</span>
                </button>
              </div>
            ) : null}
            {panel === "design" ? <Design theme={theme} consultant={draft.consultant} siteId={site.id} onChange={setTheme} onConsultant={(consultant) => setDraft((current) => ({ ...current, consultant }))} /> : null}
            {panel === "settings" ? (
              <Settings
                siteId={site.id}
                subdomain={subdomain}
                customDomain={customDomain}
                agents={agents}
                agentId={agentId}
                analytics={analytics}
                seo={seo}
                domainNote={domainNote}
                onSubdomain={setSubdomain}
                onDomain={setCustomDomain}
                onAgent={setAgentId}
                onAnalytics={setAnalytics}
                onSeo={setSeo}
                onCheck={() => void checkDomain(site.id, setDomainNote)}
              />
            ) : null}
          </aside>
          <main className="overflow-y-auto p-6">
            <div className="mb-4 flex items-center justify-end gap-3">
              {screen === "lead" && draft.resultPreview.enabled && !walk ? (
                <div className="relative">
                  <button type="button" className="text-xs text-[#52525b]" onClick={() => setTestOpen((value) => !value)}>
                    <span>Тест цифр</span>
                  </button>
                  {testOpen ? <TestDigits draft={draft} values={testVars} onChange={setTestVars} /> : null}
                </div>
              ) : null}
              <button type="button" className="text-xs text-[#52525b]" onClick={() => setWalk((value) => !value)}>
                <span>{walk ? "Режим редактирования" : "Пройти как клиент"}</span>
              </button>
            </div>
            <div className={`mx-auto flex h-[min(800px,calc(100dvh-8.5rem))] flex-col overflow-hidden border border-[#e4e4e7] bg-[#fff] ${device === "mobile" ? "w-[390px]" : "w-full max-w-5xl"}`}>
              <div className="border-b border-[#e4e4e7] bg-[#fafafa] px-4 py-2 text-center text-xs text-[#71717a]">
                <span>{liveHost.ok ? publicSiteUrl(liveHost.slug) : "https://имя.strikeplatform.io"}</span>
              </div>
              <div className="min-h-0 flex-1">
                <QuizRunner schema={draft} theme={theme} siteTitle={title} live={false} screen={walk ? undefined : screen === "gifts" ? "start" : screen} compact={device === "mobile"} embedded previewOverrides={testVars} />
              </div>
            </div>
          </main>
          <aside className="overflow-y-auto border-l border-[#e4e4e7] bg-[#fff] p-4">
            {(screen === "start" || screen === "gifts") ? <StartInspector siteId={site.id} title={title} draft={draft} focus={screen === "gifts" ? "gifts" : "start"} onChange={setDraft} /> : null}
            {step ? <StepInspector siteId={site.id} title={title} step={step} steps={draft.steps} consultant={draft.consultant} calculatorOpen={draft.resultPreview.enabled} onChange={updateStep} onConsultant={(consultant) => setDraft((current) => ({ ...current, consultant }))} onDelete={() => { setDraft((current) => ({ ...current, steps: current.steps.filter((item) => item.id !== step.id) })); setScreen("start"); }} /> : null}
            {screen === "lead" ? <LeadInspector draft={draft} onChange={setDraft} /> : null}
            {screen === "thanks" ? <ThanksInspector draft={draft} onChange={setDraft} /> : null}
          </aside>
        </div>
      )}
    </div>
  );

  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= draft.steps.length) return;
    const steps = [...draft.steps];
    const [item] = steps.splice(index, 1);
    if (!item) return;
    steps.splice(next, 0, item);
    setDraft({ ...draft, steps: steps.map((entry, order) => ({ ...entry, order })) });
  }
}

function FlowButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`min-w-0 flex-1 truncate rounded-xl px-3 py-2 text-left text-sm ${active ? "bg-[#f4f4f5] font-medium" : "hover:bg-[#fafafa]"}`}>
      <span>{label}</span>
    </button>
  );
}

function Design({ theme, consultant, siteId, onChange, onConsultant }: { theme: ThemeConfig; consultant: QuizSchema["consultant"]; siteId: string; onChange: (theme: ThemeConfig) => void; onConsultant: (consultant: QuizSchema["consultant"]) => void }) {
  return (
    <div className="mt-4 grid gap-3">
      {(Object.keys(THEME_LABEL) as Array<keyof typeof THEME_LABEL>).map((preset) => (
        <button key={preset} type="button" className={`rounded-xl border px-3 py-3 text-left text-sm ${theme.preset === preset ? "border-[#09090b]" : "border-[#e4e4e7]"}`} onClick={() => onChange({ ...theme, preset })}>
          <span>{THEME_LABEL[preset]}</span>
        </button>
      ))}
      <label className="grid gap-1 text-xs text-[#52525b]"><span>Акцент</span><input className={field} value={theme.accentColor} onChange={(event) => onChange({ ...theme, accentColor: event.target.value })} /></label>
      <label className="grid gap-1 text-xs text-[#52525b]"><span>Скругление</span><input className={field} type="number" min={0} max={28} value={theme.borderRadius} onChange={(event) => onChange({ ...theme, borderRadius: Number(event.target.value) })} /></label>
      <label className="grid gap-1 text-xs text-[#52525b]"><span>Логотип, URL</span><input className={field} value={theme.logoUrl} onChange={(event) => onChange({ ...theme, logoUrl: event.target.value })} /></label>
      <ConsultantSettings siteId={siteId} consultant={consultant} onChange={onConsultant} />
    </div>
  );
}

function Settings(props: {
  siteId: string;
  subdomain: string;
  customDomain: string;
  agents: { id: string; name: string }[];
  agentId: string;
  analytics: AnalyticsConfig;
  seo: SeoConfig;
  domainNote: string;
  onSubdomain: (value: string) => void;
  onDomain: (value: string) => void;
  onAgent: (value: string) => void;
  onAnalytics: (value: AnalyticsConfig) => void;
  onSeo: (value: SeoConfig) => void;
  onCheck: () => void;
}) {
  const check = normalizeSubdomain(props.subdomain);
  const domain = normalizeCustomDomain(props.customDomain);
  return (
    <div className="mt-4 grid gap-3 text-sm">
      <label className="grid gap-1 text-xs text-[#52525b]">
        <span>Субдомен</span>
        <input className={field} value={props.subdomain} onChange={(event) => props.onSubdomain(event.target.value)} />
      </label>
      <p className="text-xs text-[#71717a]"><span>{check.ok ? brandHost(check.slug) : check.reason}</span></p>
      {check.ok ? (
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" className="text-[#cf0234]" onClick={() => void navigator.clipboard.writeText(publicSiteUrl(check.slug))}><span>Скопировать ссылку</span></button>
          <a className="text-[#52525b]" href={fallbackSitePath(check.slug)} target="_blank" rel="noreferrer"><span>Открыть</span></a>
        </div>
      ) : null}
      <label className="grid gap-1 text-xs text-[#52525b]">
        <span>Свой домен</span>
        <input className={field} value={props.customDomain} placeholder="myagency.com" onChange={(event) => props.onDomain(event.target.value)} />
      </label>
      {props.customDomain ? (
        <div className="rounded-xl border border-[#e4e4e7] p-3 text-xs leading-5 text-[#52525b]">
          <p><span>CNAME → cname.vercel-dns.com</span></p>
          <p><span>или A → 76.76.21.21</span></p>
          <button type="button" className="mt-2 text-[#cf0234]" onClick={props.onCheck}><span>Проверить DNS</span></button>
          {props.domainNote ? <p className="mt-2"><span>{props.domainNote}</span></p> : null}
          {domain.ok ? null : <p><span>{domain.reason}</span></p>}
        </div>
      ) : null}
      <label className="grid gap-1 text-xs text-[#52525b]">
        <span>AI-агент</span>
        <select className={field} value={props.agentId} onChange={(event) => props.onAgent(event.target.value)}>
          <option value="">Не привязан</option>
          {props.agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={props.analytics.syncLeads} onChange={(event) => props.onAnalytics({ ...props.analytics, syncLeads: event.target.checked })} /><span>Создавать лид в лидогенерации</span></label>
      <label className="grid gap-1 text-xs text-[#52525b]"><span>WhatsApp</span><input className={field} value={props.analytics.whatsapp} onChange={(event) => props.onAnalytics({ ...props.analytics, whatsapp: event.target.value })} /></label>
      <label className="grid gap-1 text-xs text-[#52525b]"><span>Meta Pixel</span><input className={field} value={props.analytics.metaPixelId} onChange={(event) => props.onAnalytics({ ...props.analytics, metaPixelId: event.target.value })} /></label>
      <label className="grid gap-1 text-xs text-[#52525b]"><span>GA4</span><input className={field} value={props.analytics.ga4Id} onChange={(event) => props.onAnalytics({ ...props.analytics, ga4Id: event.target.value })} /></label>
      <label className="grid gap-1 text-xs text-[#52525b]"><span>Яндекс.Метрика</span><input className={field} value={props.analytics.yandexMetrikaId} onChange={(event) => props.onAnalytics({ ...props.analytics, yandexMetrikaId: event.target.value })} /></label>
      <label className="grid gap-1 text-xs text-[#52525b]"><span>SEO title</span><input className={field} value={props.seo.title} onChange={(event) => props.onSeo({ ...props.seo, title: event.target.value })} /></label>
      <label className="grid gap-1 text-xs text-[#52525b]"><span>SEO description</span><textarea className={`${field} h-20 py-2`} value={props.seo.description} onChange={(event) => props.onSeo({ ...props.seo, description: event.target.value })} /></label>
    </div>
  );
}

function StepInspector({ siteId, title, step, steps, consultant, calculatorOpen, onChange, onConsultant, onDelete }: { siteId: string; title: string; step: QuizSchema["steps"][number]; steps: QuizSchema["steps"]; consultant: QuizSchema["consultant"]; calculatorOpen: boolean; onChange: (step: QuizSchema["steps"][number]) => void; onConsultant: (consultant: QuizSchema["consultant"]) => void; onDelete: () => void }) {
  const choice = step.type === "single_choice" || step.type === "multi_choice" || step.type === "image_cards";
  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold"><span>Вопрос</span></p>
      <select className={field} value={step.type} onChange={(event) => onChange({ ...step, type: event.target.value as QuizSchema["steps"][number]["type"] })}>
        <option value="single_choice">Один вариант</option>
        <option value="multi_choice">Несколько</option>
        <option value="image_cards">Карточки</option>
        <option value="range_slider">Ползунок</option>
        <option value="text_input">Текст</option>
      </select>
      <Text label="Вопрос" value={step.title} onChange={(title) => onChange({ ...step, title })} />
      <Text label="Пояснение" value={step.subtitle} onChange={(subtitle) => onChange({ ...step, subtitle })} />
      {step.options.map((option, index) => (
        <div key={option.id} className="grid gap-2 rounded-xl border border-[#e4e4e7] p-3">
          <input className={field} value={option.label} onChange={(event) => {
            const options = step.options.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item);
            onChange({ ...step, options });
          }} />
          {choice ? (
            <label className="grid gap-1 text-xs text-[#52525b]">
              <span>Значение / вес</span>
              <input className={field} inputMode="decimal" value={option.numericValue ?? ""} placeholder="6000000" onChange={(event) => {
                const raw = event.target.value.trim();
                const numericValue = raw === "" ? undefined : Number(raw.replace(",", "."));
                const options = step.options.map((item, itemIndex) => {
                  if (itemIndex !== index) return item;
                  if (numericValue === undefined || !Number.isFinite(numericValue)) {
                    const rest = { ...item };
                    delete rest.numericValue;
                    return rest;
                  }
                  return { ...item, numericValue };
                });
                onChange({ ...step, options });
              }} />
            </label>
          ) : null}
          <select className={field} value={option.nextStepId ?? ""} onChange={(event) => {
            const options = step.options.map((item, itemIndex) => itemIndex === index ? { ...item, nextStepId: event.target.value || null } : item);
            onChange({ ...step, options });
          }}>
            <option value="">Дальше по порядку</option>
            {steps.filter((item) => item.id !== step.id).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </div>
      ))}
      <details key={`${step.id}-${calculatorOpen ? "on" : "off"}`} className="rounded-xl border border-[#e4e4e7] p-3" open={calculatorOpen || undefined}>
        <summary className="cursor-pointer text-sm"><span>Для калькулятора</span></summary>
        <div className="mt-3 grid gap-2">
          <Text label="Ключ переменной" value={step.variableKey ?? ""} onChange={(variableKey) => onChange({ ...step, variableKey: variableKey.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32) })} />
          <p className="text-[11px] text-[#71717a]"><span>Например budget, area, ad_spend. Этот ключ подставляется в формулы.</span></p>
          <label className="grid gap-1 text-xs text-[#52525b]">
            <span>Значение по умолчанию</span>
            <input className={field} inputMode="decimal" value={step.defaultNumericValue ?? ""} onChange={(event) => {
              const raw = event.target.value.trim();
              if (!raw) {
                const rest = { ...step };
                delete rest.defaultNumericValue;
                onChange(rest);
                return;
              }
              const parsed = Number(raw.replace(",", "."));
              if (Number.isFinite(parsed)) onChange({ ...step, defaultNumericValue: parsed });
            }} />
          </label>
        </div>
      </details>
      <HelperInspector siteId={siteId} title={title} step={step} consultant={consultant} onChange={onChange} onConsultant={onConsultant} />
      {steps.length > 1 ? <button type="button" className="text-left text-sm text-[#cf0234]" onClick={onDelete}><span>Удалить вопрос</span></button> : null}
    </div>
  );
}

function LeadInspector({ draft, onChange }: { draft: QuizSchema; onChange: (draft: QuizSchema) => void }) {
  const lead = draft.leadScreen;
  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold"><span>Контакт</span></p>
      <Text label="Заголовок" value={lead.headline} onChange={(headline) => onChange({ ...draft, leadScreen: { ...lead, headline } })} />
      <Text label="Кнопка" value={lead.ctaText} onChange={(ctaText) => onChange({ ...draft, leadScreen: { ...lead, ctaText } })} />
      <ResultInspector draft={draft} onChange={onChange} />
    </div>
  );
}

function ThanksInspector({ draft, onChange }: { draft: QuizSchema; onChange: (draft: QuizSchema) => void }) {
  const thanks = draft.thankYouScreen;
  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold"><span>Спасибо</span></p>
      <Text label="Заголовок" value={thanks.headline} onChange={(headline) => onChange({ ...draft, thankYouScreen: { ...thanks, headline } })} />
      <Text label="Текст" value={thanks.subheadline} onChange={(subheadline) => onChange({ ...draft, thankYouScreen: { ...thanks, subheadline } })} />
    </div>
  );
}

function Text({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs text-[#52525b]">
      <span>{label}</span>
      <input className={field} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Leads({ rows, onClose }: { rows: Awaited<ReturnType<typeof listSubmissions>>; onClose: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-semibold"><span>Заявки</span></h2>
        <div className="flex gap-3">
          <button type="button" className="text-sm text-[#cf0234]" onClick={() => downloadCsv(rows)}><span>CSV</span></button>
          <button type="button" className="text-sm" onClick={onClose}><span>Закрыть</span></button>
        </div>
      </div>
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-[#71717a]"><tr><th className="py-2">Имя</th><th>Телефон</th><th>Ответы</th><th>Дата</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)} className="border-t border-[#e4e4e7]">
              <td className="py-3"><span>{String(row.contact_name ?? "")}</span></td>
              <td><span>{String(row.contact_phone ?? "")}</span></td>
              <td className="max-w-md">
                <span>{summarize(row.answers)}</span>
                <CalculatedResult value={row.calculated_result} />
              </td>
              <td><span>{String(row.created_at ?? "").slice(0, 16).replace("T", " ")}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? <p className="mt-6 text-sm text-[#71717a]"><span>Заявок пока нет.</span></p> : null}
    </div>
  );
}

function summarize(value: unknown) {
  if (!Array.isArray(value)) return "";
  return value.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return `${String(row.question ?? "")}: ${String(row.answer ?? "")}`;
  }).join(" · ");
}

function CalculatedResult({ value }: { value: unknown }) {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  if (!record || record.enabled === false) return null;
  const kpis = Array.isArray(record.kpis) ? record.kpis : [];
  const table = record.table && typeof record.table === "object" ? (record.table as { rows?: Array<{ cells?: Array<{ text?: string }> }> }) : null;
  const rows = table?.rows ?? [];
  if (kpis.length === 0 && rows.length === 0 && !record.headline) return null;
  return (
    <details className="mt-2 rounded-lg bg-[#fafafa] px-2 py-1">
      <summary className="cursor-pointer text-xs text-[#52525b]"><span>Рассчитанный результат</span></summary>
      {record.headline ? <p className="mt-1 text-xs"><span>{String(record.headline)}</span></p> : null}
      {kpis.map((item, index) => {
        const kpi = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return <p key={index} className="text-xs text-[#3f3f46]"><span>{`${String(kpi.label ?? "")}: ${String(kpi.text ?? "")}`}</span></p>;
      })}
      {rows.map((row, index) => (
        <p key={index} className="text-xs text-[#3f3f46]"><span>{(row.cells ?? []).map((cell) => cell.text ?? "").join(" · ")}</span></p>
      ))}
    </details>
  );
}

function TestDigits({ draft, values, onChange }: { draft: QuizSchema; values: Record<string, number>; onChange: (values: Record<string, number>) => void }) {
  const keys = [...new Set([...draft.steps.map((step) => step.variableKey).filter((item): item is string => Boolean(item)), ...Object.keys(draft.resultPreview.sampleDefaults ?? {})])];
  return (
    <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-[#e4e4e7] bg-[#fff] p-3 text-left shadow-lg">
      <p className="mb-2 text-xs font-medium text-[#09090b]"><span>Тестовые значения</span></p>
      {keys.length === 0 ? <p className="text-[11px] text-[#71717a]"><span>Добавьте ключ переменной в вопросе.</span></p> : null}
      {keys.map((key) => (
        <label key={key} className="mt-2 grid gap-1 text-[11px] text-[#52525b]">
          <span>{key}</span>
          <input className={field} inputMode="decimal" value={values[key] ?? draft.resultPreview.sampleDefaults?.[key] ?? ""} onChange={(event) => {
            const parsed = Number(event.target.value.replace(/\s/g, "").replace(",", "."));
            const next = { ...values };
            if (!Number.isFinite(parsed)) delete next[key];
            else next[key] = parsed;
            onChange(next);
          }} />
        </label>
      ))}
    </div>
  );
}

function downloadCsv(rows: Awaited<ReturnType<typeof listSubmissions>>) {
  const lines = ["name,phone,email,answers,created_at", ...rows.map((row) => [row.contact_name, row.contact_phone, row.contact_email, summarize(row.answers), row.created_at].map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "quiz-leads.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function checkDomain(id: string, setNote: (value: string) => void) {
  const response = await fetch(`/api/sites/${id}/verify-domain`, { method: "POST" });
  const body = (await response.json()) as { detail?: string };
  setNote(body.detail ?? "");
}
