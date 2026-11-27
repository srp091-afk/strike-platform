"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, Loader2, Monitor, Smartphone } from "lucide-react";

import { QuizRunner } from "@/components/sites/quiz-runner";
import { DeliveryFields, StartInspector } from "@/components/sites/start-inspector";
import { ResultInspector } from "@/components/sites/result-inspector";
import { ConsultantSettings, HelperInspector } from "@/components/sites/consultant-inspector";
import { listSubmissions, saveQuiz } from "@/app/funnels/site-actions";
import { normalizeCustomDomain, normalizeSubdomain } from "@/lib/sites/domains";
import { copyText, getPublicSiteDisplayUrl, getPublicSiteUrl } from "@/lib/sites/public-url";
import { newStep, type AnalyticsConfig, type QuizSchema, type SeoConfig, type ThemeConfig } from "@/lib/sites/quiz-schema";
import { stripMarkers } from "@/lib/sites/quiz-polish";
import { StudioSelect, StudioToggle } from "@/components/sites/studio-controls";
import { THEME_LABEL } from "@/lib/sites/theme";

type StudioSite = {
  id: string;
  title: string;
  subdomain: string | null;
  customDomain: string | null;
  status: "draft" | "published" | "paused";
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
  const [title, setTitle] = useState(stripMarkers(site.title));
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
  const [status, setStatus] = useState(site.status);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [toast, setToast] = useState<{ href: string } | null>(null);
  const [leads, setLeads] = useState<Awaited<ReturnType<typeof listSubmissions>>>([]);
  const [testOpen, setTestOpen] = useState(false);
  const [testVars, setTestVars] = useState<Record<string, number>>({});
  const snapshot = useMemo(() => JSON.stringify({ title, draft, theme, analytics, seo, agentId, subdomain, customDomain }), [title, draft, theme, analytics, seo, agentId, subdomain, customDomain]);
  const [baseline, setBaseline] = useState(snapshot);
  const chain = useRef(Promise.resolve());
  const patch = { title, subdomain, customDomain, theme, draft, analytics, seo, agentId: agentId || null };

  function enqueue(task: () => Promise<void>) {
    const run = chain.current.then(task, task);
    chain.current = run.then(() => undefined, () => undefined);
    return run;
  }

  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => {
      void enqueue(async () => {
        const result = await saveQuiz(site.id, patch);
        setSaved(result.ok);
        if (!result.ok && result.error) setErrorText(result.error);
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [snapshot, site.id, title, subdomain, customDomain, theme, draft, analytics, seo, agentId]);

  const step = draft.steps.find((item) => item.id === screen) ?? null;
  const liveHost = normalizeSubdomain(subdomain);
  const hostLabel = !subdomain.trim() ? "strikeplatform.io/s/имя" : liveHost.ok ? getPublicSiteDisplayUrl(liveHost.slug) : liveHost.reason;
  const publicUrl = liveHost.ok ? getPublicSiteUrl(liveHost.slug) : "";
  const unpublished = status !== "published" || snapshot !== baseline;
  const publishLabel = publishing ? "Публикуем…" : status === "published" && !unpublished ? "Опубликовано ✓" : status === "published" ? "Опубликовать изменения" : "Опубликовать";

  async function copyLink(slug: string) {
    const url = getPublicSiteUrl(slug);
    const ok = await copyText(url);
    if (!ok) {
      setErrorText("Не удалось скопировать ссылку.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  async function publish() {
    if (publishing || !liveHost.ok) {
      if (!liveHost.ok) setErrorText(liveHost.reason || "Сначала задайте адрес сайта.");
      return;
    }
    setPublishing(true);
    setErrorText("");
    setToast(null);
    try {
      await enqueue(async () => {
        const savedResult = await saveQuiz(site.id, patch);
        setSaved(savedResult.ok);
        if (!savedResult.ok) throw new Error(savedResult.error ?? "Не удалось сохранить черновик.");
        const response = await fetch(`/api/sites/${site.id}/publish`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; publicUrl?: string; subdomain?: string } | null;
        if (!response.ok || !body?.ok) {
          throw new Error(body?.error || `Не удалось опубликовать (${response.status}).`);
        }
        setStatus("published");
        setBaseline(snapshot);
        setToast({ href: body.publicUrl || getPublicSiteUrl(body.subdomain || liveHost.slug) });
        window.setTimeout(() => setToast(null), 6000);
      });
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Не удалось опубликовать.");
    } finally {
      setPublishing(false);
    }
  }

  function updateStep(next: QuizSchema["steps"][number]) {
    setDraft((current) => ({ ...current, steps: current.steps.map((item) => (item.id === next.id ? next : item)) }));
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-[#fafafa] text-[#09090b]">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#e4e4e7] bg-[#fff] px-4">
        <Link href="/funnels" className="text-sm text-[#52525b]"><span>← Сайты</span></Link>
        <input value={title} onChange={(event) => setTitle(event.target.value)} className="h-9 min-w-0 max-w-[260px] flex-1 truncate bg-transparent text-sm font-semibold outline-none" />
        {liveHost.ok ? (
          <a href={publicUrl} target="_blank" rel="noopener noreferrer" title={status === "draft" ? "Сначала нажмите «Опубликовать»" : hostLabel} className="hidden max-w-[240px] items-center gap-1.5 truncate rounded-full border border-[#e4e4e7] px-3 py-1 text-xs text-[#09090b] sm:inline-flex">
            <span className="truncate">{hostLabel}</span>
            <ExternalLink className="h-[13px] w-[13px] shrink-0" />
          </a>
        ) : (
          <button type="button" className="hidden items-center gap-2 rounded-full border border-[#e4e4e7] px-3 py-1 text-xs sm:inline-flex" onClick={() => { setPanel("settings"); }}>
            <span>{hostLabel}</span>
          </button>
        )}
        {liveHost.ok ? (
          <button type="button" className="inline-flex items-center gap-1 text-xs text-[#cf0234]" onClick={() => void copyLink(liveHost.slug)}>
            {copied ? <Check className="h-3.5 w-3.5" /> : null}
            <span>{copied ? "Скопировано ✓" : "Скопировать ссылку"}</span>
          </button>
        ) : null}
        <div className="inline-flex items-center rounded-lg bg-[#f4f4f5] p-0.5">
          <button type="button" aria-label="Desktop" className={`grid h-7 w-8 place-items-center rounded-md ${device === "desktop" ? "bg-[#fff] text-[#09090b]" : "text-[#71717a]"}`} onClick={() => setDevice("desktop")}>
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button type="button" aria-label="Mobile" className={`grid h-7 w-8 place-items-center rounded-md ${device === "mobile" ? "bg-[#fff] text-[#09090b]" : "text-[#71717a]"}`} onClick={() => setDevice("mobile")}>
            <Smartphone className="h-3.5 w-3.5" />
          </button>
        </div>
        <button type="button" className="text-xs text-[#52525b]" onClick={() => { setLeadsOpen(true); void listSubmissions(site.id).then(setLeads); }}>
          <span>{`Заявки (${site.leads})`}</span>
        </button>
        <span className="text-xs text-[#71717a]"><span>{saved ? "Сохранено" : "Сохраняем…"}</span></span>
        <button type="button" disabled={publishing} className={`inline-flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-70 ${unpublished ? "bg-[#cf0234] text-[#fff]" : "border border-[#e4e4e7] bg-[#fff] text-[#09090b]"}`} onClick={() => void publish()}>
          {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          <span>{publishLabel}</span>
        </button>
      </header>
      {errorText ? <p className="border-b border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-sm text-[#b91c1c]"><span>{errorText}</span></p> : null}
      {toast ? (
        <div className="fixed right-4 top-4 z-[90] flex items-center gap-3 rounded-xl border border-[#e4e4e7] bg-[#fff] px-4 py-3 text-sm text-[#09090b] shadow-[0_12px_32px_-16px_rgba(0,0,0,0.25)]">
          <span>Сайт опубликован</span>
          <a href={toast.href} target="_blank" rel="noopener noreferrer" className="font-medium text-[#cf0234]"><span>Открыть ↗</span></a>
        </div>
      ) : null}
      {leadsOpen ? (
        <Leads rows={leads} onClose={() => setLeadsOpen(false)} />
      ) : (
        <div className="grid min-h-0 flex-1 lg:grid-cols-[260px_minmax(0,1fr)_320px]">
          <aside className="min-w-0 overflow-x-hidden overflow-y-auto border-r border-[#e4e4e7] bg-[#fff] p-4">
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
                {draft.steps.map((item, index) => (
                  <div key={item.id} className="flex min-w-0 gap-1">
                    <FlowButton active={screen === item.id} label={`${String(index + 1).padStart(2, "0")} ${item.title}`} onClick={() => setScreen(item.id)} />
                    <button type="button" className="text-xs text-[#71717a]" onClick={() => move(index, -1)}><span>↑</span></button>
                    <button type="button" className="text-xs text-[#71717a]" onClick={() => move(index, 1)}><span>↓</span></button>
                  </div>
                ))}
                <button type="button" className="text-left text-sm text-[#cf0234]" onClick={() => { const created = newStep(draft.steps.length); setDraft({ ...draft, steps: [...draft.steps, created] }); setScreen(created.id); }}>
                  <span>+ Добавить вопрос</span>
                </button>
                <FlowButton active={screen === "lead"} label="Контакт" onClick={() => setScreen("lead")} />
                <FlowButton active={screen === "thanks"} label="Спасибо" onClick={() => setScreen("thanks")} />
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
                copied={copied}
                onCopy={(slug) => void copyLink(slug)}
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
                {liveHost.ok ? (
                  <a href={publicUrl} target="_blank" rel="noopener noreferrer" title={status === "draft" ? "Сначала нажмите «Опубликовать»" : undefined} className="inline-flex items-center gap-1 text-[#52525b]">
                    <span>{hostLabel}</span>
                    <ExternalLink className="h-[13px] w-[13px]" />
                  </a>
                ) : <span>strikeplatform.io/s/имя</span>}
              </div>
              <div className="min-h-0 flex-1">
                <QuizRunner schema={draft} theme={theme} siteTitle={title} live={false} screen={walk ? undefined : screen} compact={device === "mobile"} embedded previewOverrides={testVars} />
              </div>
            </div>
          </main>
          <aside className="overflow-y-auto border-l border-[#e4e4e7] bg-[#fff] p-4">
            {screen === "start" ? <StartInspector siteId={site.id} title={title} preset={theme.preset} draft={draft} onChange={setDraft} /> : null}
            {step ? <StepInspector siteId={site.id} title={title} step={step} steps={draft.steps} consultant={draft.consultant} calculatorOpen={draft.resultPreview.enabled} onChange={updateStep} onConsultant={(consultant) => setDraft((current) => ({ ...current, consultant }))} onDelete={() => { setDraft((current) => ({ ...current, steps: current.steps.filter((item) => item.id !== step.id) })); setScreen("start"); }} /> : null}
            {screen === "lead" ? <LeadInspector siteId={site.id} title={title} draft={draft} onChange={setDraft} /> : null}
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
  copied: boolean;
  onCopy: (slug: string) => void;
}) {
  const check = normalizeSubdomain(props.subdomain);
  const domain = normalizeCustomDomain(props.customDomain);
  return (
    <div className="mt-4 grid gap-3 text-sm">
      <label className="grid gap-1 text-xs text-[#52525b]">
        <span>Субдомен</span>
        <input className={field} value={props.subdomain} onChange={(event) => props.onSubdomain(event.target.value)} />
      </label>
      <p className="text-xs text-[#71717a]"><span>{check.ok ? getPublicSiteDisplayUrl(check.slug) : check.reason}</span></p>
      {check.ok ? (
        <div className="flex flex-wrap gap-3 text-xs">
          <button type="button" className="text-[#cf0234]" onClick={() => props.onCopy(check.slug)}><span>{props.copied ? "Скопировано ✓" : "Скопировать ссылку"}</span></button>
          <a className="text-[#52525b]" href={getPublicSiteUrl(check.slug)} target="_blank" rel="noopener noreferrer"><span>Открыть</span></a>
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
        <StudioSelect ariaLabel="AI-агент" value={props.agentId} onChange={props.onAgent} options={[{ value: "", label: "Не привязан" }, ...props.agents.map((agent) => ({ value: agent.id, label: agent.name }))]} />
      </label>
      <StudioToggle label="Создавать лид в лидогенерации" checked={props.analytics.syncLeads} onChange={(syncLeads) => props.onAnalytics({ ...props.analytics, syncLeads })} />
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
      <StudioSelect ariaLabel="Тип вопроса" value={step.type} onChange={(type) => onChange({ ...step, type: type as QuizSchema["steps"][number]["type"] })} options={[
        { value: "single_choice", label: "Один вариант" },
        { value: "multi_choice", label: "Несколько" },
        { value: "image_cards", label: "Карточки" },
        { value: "range_slider", label: "Ползунок" },
        { value: "text_input", label: "Текст" },
      ]} />
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
          <StudioSelect ariaLabel="Следующий шаг" value={option.nextStepId ?? ""} onChange={(next) => {
            const options = step.options.map((item, itemIndex) => itemIndex === index ? { ...item, nextStepId: next || null } : item);
            onChange({ ...step, options });
          }} options={[{ value: "", label: "Дальше по порядку" }, ...steps.filter((item) => item.id !== step.id).map((item) => ({ value: item.id, label: item.title }))]} />
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

function LeadInspector({ siteId, title, draft, onChange }: { siteId: string; title: string; draft: QuizSchema; onChange: (draft: QuizSchema) => void }) {
  const lead = draft.leadScreen;
  function patch(next: Partial<QuizSchema["leadScreen"]>) {
    onChange({ ...draft, leadScreen: { ...lead, ...next } });
  }
  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold"><span>Контакт</span></p>
      <Text label="Заголовок" value={lead.headline} onChange={(headline) => patch({ headline })} />
      <Text label="Кнопка" value={lead.ctaText} onChange={(ctaText) => patch({ ctaText })} />
      <div className="grid gap-2 rounded-xl border border-[#e4e4e7] p-3">
        <p className="text-xs font-medium text-[#52525b]"><span>Поля формы контакта</span></p>
        <StudioToggle label="Имя" checked={lead.askName} onChange={(askName) => patch({ askName })} />
        {lead.askName ? <StudioToggle label="Имя обязательно" checked={lead.nameRequired} onChange={(nameRequired) => patch({ nameRequired })} /> : null}
        <StudioToggle label="Телефон" checked={lead.askPhone} onChange={(askPhone) => patch({ askPhone })} />
        {lead.askPhone ? <StudioToggle label="Телефон обязательно" checked={lead.phoneRequired} onChange={(phoneRequired) => patch({ phoneRequired })} /> : null}
        <StudioToggle label="Email" checked={lead.askEmail} onChange={(askEmail) => patch({ askEmail })} />
        {lead.askEmail ? <StudioToggle label="Email обязательно" checked={lead.emailRequired} onChange={(emailRequired) => patch({ emailRequired })} /> : null}
        <StudioToggle label="Выбор мессенджера (WhatsApp / Telegram / Звонок)" checked={lead.askMessenger} onChange={(askMessenger) => patch({ askMessenger })} />
      </div>
      <ResultInspector siteId={siteId} title={title} draft={draft} onChange={onChange} />
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
      <DeliveryFields gifts={draft.giftsConfig} onChange={(next) => onChange({ ...draft, giftsConfig: { ...draft.giftsConfig, ...next } })} />
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
