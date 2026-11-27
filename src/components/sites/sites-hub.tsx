"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";

import { createManualQuiz, deleteSite, duplicateSite } from "@/app/funnels/site-actions";
import type { LandingListItem } from "@/lib/landing-types";
import { brandHost, fallbackSitePath, normalizeSubdomain, publicSiteUrl } from "@/lib/sites/domains";
import type { ThemePreset } from "@/lib/sites/quiz-schema";
import { THEME_LABEL } from "@/lib/sites/theme";
import { jsonFetcher } from "@/lib/swr";

const FORMATS = [
  { id: "quiz", label: "Квиз-сайт", hint: "NEW", disabled: false },
  { id: "landing", label: "Лендинг", hint: "", disabled: false },
  { id: "multipage", label: "Многостраничник", hint: "Скоро", disabled: true },
  { id: "store", label: "Магазин", hint: "Скоро", disabled: true },
  { id: "bio", label: "Био-хаб", hint: "Скоро", disabled: true },
] as const;

const QUIZ_PRESETS = [
  { label: "Подбор недвижимости", prompt: "Квиз подбора квартиры или дома: бюджет, район, срок, цель покупки." },
  { label: "Расчёт ремонта", prompt: "Квиз расчёта ремонта: площадь, тип жилья, уровень отделки, срок." },
  { label: "B2B аудит / КП", prompt: "Квиз для B2B-аудита: ниша, оборот, задача, срок принятия решения." },
  { label: "Подбор авто", prompt: "Квиз подбора автомобиля: бюджет, новый или с пробегом, кузов, срок." },
  { label: "Стоматология / Клиника", prompt: "Квиз записи в клинику: услуга, срочность, бюджет, удобный контакт." },
];

const LANDING_PRESETS = [
  { label: "Ремонт квартир", prompt: "Сайт студии ремонта квартир под ключ. Дорогой тон и перевод в чат с агентом." },
  { label: "Виллы в Дубае", prompt: "Сайт продажи и отделки вилл в Дубае. Конкретный оффер и перевод в ИИ-чат." },
];

type AgentsResponse = { agents?: { id: string; name: string; is_active?: boolean }[] };

export function SitesHub({ sites, loadError }: { sites: LandingListItem[]; loadError: string | null }) {
  const router = useRouter();
  const agents = useSWR<AgentsResponse>("/api/agents", jsonFetcher, { revalidateOnFocus: false });
  const [format, setFormat] = useState<(typeof FORMATS)[number]["id"]>("quiz");
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState("");
  const [preset, setPreset] = useState<ThemePreset>("dark_premium");
  const [subdomain, setSubdomain] = useState("");
  const nameCheck = normalizeSubdomain(subdomain);
  const namePreview = !subdomain.trim() ? "имя.strikeplatform.io" : nameCheck.ok ? brandHost(nameCheck.slug) : nameCheck.reason;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const presets = format === "quiz" ? QUIZ_PRESETS : LANDING_PRESETS;
  const visible = useMemo(() => sites.filter((site) => {
    if (filter === "quiz" && site.siteType !== "quiz") return false;
    if (filter === "landing" && site.siteType !== "landing") return false;
    const haystack = `${site.title} ${site.subdomain ?? ""} ${site.slug}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [sites, filter, query]);

  async function generate() {
    const text = prompt.trim();
    if (text.length < 8) return;
    if (format === "landing") {
      router.push(`/funnels/builder?prompt=${encodeURIComponent(text)}`);
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/sites/generate-quiz", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: text, agentId: agentId || null, preset, subdomain }),
    });
    const body = (await response.json()) as { id?: string; error?: string };
    setBusy(false);
    if (!response.ok || !body.id) {
      setError(body.error ?? "Не удалось собрать квиз.");
      return;
    }
    router.push(`/funnels/${body.id}`);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12 text-[#09090b]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#71717a]"><span>Сайты</span></p>
      <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl"><span>Что запускаем?</span></h1>
      <p className="mt-3 max-w-xl text-sm leading-6 text-[#52525b]"><span>Квиз собирает заявку. Лендинг ведёт в чат с агентом. Остальные форматы появятся здесь же.</span></p>

      <div className="mt-8 flex flex-wrap gap-2">
        {FORMATS.map((item) => (
          <button key={item.id} type="button" disabled={item.disabled} title={item.disabled ? "Скоро" : undefined} onClick={() => setFormat(item.id)} className={`rounded-full border px-4 py-2 text-sm ${format === item.id ? "border-[#09090b] bg-[#09090b] text-[#fff]" : "border-[#e4e4e7] bg-[#fff] text-[#09090b]"} disabled:opacity-40`}>
            <span>{item.label}</span>
            {item.hint ? <span className="ml-2 text-[10px] uppercase tracking-wide">{item.hint}</span> : null}
          </button>
        ))}
      </div>

      <form className="mt-6 rounded-3xl border border-[#e4e4e7] bg-[#fff] p-4" onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <textarea value={prompt} rows={4} placeholder="Ниша и цель: кого квалифицируем и что хотим получить." className="w-full resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-[#a1a1aa]" onChange={(event) => setPrompt(event.target.value)} />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <select className="h-11 rounded-xl border border-[#e4e4e7] bg-[#fff] px-3 text-sm" value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            <option value="">Агент не выбран</option>
            {(agents.data?.agents ?? []).filter((agent) => agent.is_active !== false).map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
          </select>
          <select className="h-11 rounded-xl border border-[#e4e4e7] bg-[#fff] px-3 text-sm" value={preset} onChange={(event) => setPreset(event.target.value as ThemePreset)}>
            {(Object.keys(THEME_LABEL) as ThemePreset[]).map((item) => <option key={item} value={item}>{THEME_LABEL[item]}</option>)}
          </select>
          <label className="grid gap-1">
            <input value={subdomain} placeholder="Имя, например legiontraffic" className="h-11 rounded-xl border border-[#e4e4e7] px-3 text-sm outline-none" onChange={(event) => setSubdomain(event.target.value)} />
            <span className="px-1 text-xs text-[#71717a]"><span>{namePreview}</span></span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="text-sm text-[#52525b]" disabled={busy} onClick={() => void createManualQuiz("Новый квиз").then((result) => router.push(`/funnels/${result.id}`))}>
            <span>Создать вручную из шаблона</span>
          </button>
          <button type="submit" disabled={busy || prompt.trim().length < 8 || format === "multipage" || format === "store" || format === "bio"} className="h-11 rounded-xl bg-[#cf0234] px-5 text-sm font-semibold text-[#fff] disabled:opacity-40">
            <span>{busy ? "Собираем" : format === "landing" ? "Собрать лендинг" : "Собрать квиз"}</span>
          </button>
        </div>
        {error ? <p className="mt-3 text-sm text-[#cf0234]"><span>{error}</span></p> : null}
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {presets.map((item) => (
          <button key={item.label} type="button" className="rounded-full border border-[#e4e4e7] bg-[#fff] px-3 py-1.5 text-sm" onClick={() => setPrompt(item.prompt)}>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <section className="mt-16">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-2xl font-semibold"><span>Мои сайты</span></h2>
          <input value={query} placeholder="Поиск" className="h-10 rounded-xl border border-[#e4e4e7] bg-[#fff] px-3 text-sm outline-none" onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="mt-4 flex gap-2 text-sm">
          {[["all", "Все"], ["quiz", "Квизы"], ["landing", "Лендинги"]].map(([id, label]) => (
            <button key={id} type="button" className={`rounded-full px-3 py-1 ${filter === id ? "bg-[#09090b] text-[#fff]" : "bg-[#fff] text-[#52525b]"}`} onClick={() => setFilter(id)}>
              <span>{label}</span>
            </button>
          ))}
        </div>
        {loadError ? <p className="mt-4 text-sm text-[#cf0234]"><span>{loadError}</span></p> : null}
        {visible.length === 0 ? <p className="mt-6 rounded-2xl border border-dashed border-[#e4e4e7] px-6 py-12 text-center text-sm text-[#71717a]"><span>Сайтов пока нет.</span></p> : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {visible.map((site) => {
              const address = site.subdomain ? brandHost(site.subdomain) : "";
              const conversion = site.views > 0 ? Math.round((site.leads / site.views) * 1000) / 10 : 0;
              return (
                <li key={site.id} className="rounded-2xl border border-[#e4e4e7] bg-[#fff] p-5">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-[#f4f4f5] px-2 py-1"><span>{site.siteType === "quiz" ? "Квиз" : "Лендинг"}</span></span>
                    <span className="text-[#52525b]"><span>{site.status === "published" ? "Опубликован" : site.status === "paused" ? "Пауза" : "Черновик"}</span></span>
                  </div>
                  <button type="button" className="mt-4 text-left text-xl font-semibold" onClick={() => router.push(site.siteType === "quiz" ? `/funnels/${site.id}` : `/funnels/builder?id=${site.id}`)}>
                    <span>{site.title}</span>
                  </button>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#52525b]">
                    {address ? <a href={fallbackSitePath(site.subdomain!)} target="_blank" rel="noreferrer"><span>{address}</span></a> : <span>Адрес появится после публикации</span>}
                    {site.subdomain ? <button type="button" className="text-[#cf0234]" onClick={() => void navigator.clipboard.writeText(publicSiteUrl(site.subdomain!))}><span>Скопировать ссылку</span></button> : null}
                  </p>
                  <p className="mt-4 text-sm text-[#71717a]"><span>{`${site.views} просмотров · ${site.leads} лидов · ${conversion}%`}</span></p>
                  <p className="mt-2 text-sm"><span>{site.agentName ?? "Агент не выбран"}</span></p>
                  <div className="mt-4 flex flex-wrap gap-3 text-sm">
                    <button type="button" onClick={() => router.push(site.siteType === "quiz" ? `/funnels/${site.id}` : `/funnels/builder?id=${site.id}`)}><span>Открыть редактор</span></button>
                    {site.siteType === "quiz" ? <button type="button" onClick={() => router.push(`/funnels/${site.id}`)}><span>Заявки</span></button> : null}
                    {site.siteType === "quiz" ? <button type="button" onClick={() => void duplicateSite(site.id).then((result) => { if (result.id) router.push(`/funnels/${result.id}`); })}><span>Дублировать</span></button> : null}
                    <button type="button" onClick={() => void deleteSite(site.id).then(() => router.refresh())}><span>Удалить</span></button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
