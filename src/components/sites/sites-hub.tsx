"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check, Loader2 } from "lucide-react";

import { createManualLanding, createManualQuiz, deleteSite, duplicateSite } from "@/app/funnels/site-actions";
import type { LandingListItem } from "@/lib/landing-types";
import { copyText, getPublicSiteDisplayUrl, getPublicSiteUrl } from "@/lib/sites/public-url";
import type { ThemePreset } from "@/lib/sites/quiz-schema";

const SITE_FORMATS = [
  { id: "quiz", label: "Квиз-сайт", available: true },
  { id: "landing", label: "Лендинг", available: true },
  { id: "multipage", label: "Многостраничник", available: false },
  { id: "store", label: "Магазин", available: false },
  { id: "biohub", label: "Био-хаб", available: false },
] as const;

const THEMES: { id: ThemePreset; label: string; swatch: string }[] = [
  { id: "dark_premium", label: "Dark Premium", swatch: "bg-[#09090b]" },
  { id: "light_minimal", label: "Light Minimal", swatch: "border border-[#d4d4d8] bg-[#fff]" },
  { id: "editorial_warm", label: "Editorial Warm", swatch: "border border-[#D6CBB8] bg-[#EFE7DA]" },
];

const QUIZ_PRESETS = [
  { label: "Подбор недвижимости", prompt: "Квиз по подбору инвестиционной недвижимости (апартаменты и виллы): бюджет, цель покупки, формат, срок. С расчётом годовой доходности в превью результата и PDF-подборкой закрытых объектов в подарок." },
  { label: "Расчёт ремонта", prompt: "Квиз для расчёта стоимости ремонта под ключ: площадь, тип объекта, уровень отделки, сроки старта. С предварительной сметой по этапам в превью и чек-листом скрытых ошибок ремонта в подарок." },
  { label: "B2B аудит / КП", prompt: "Квиз для маркетингового агентства / B2B-аудита: текущий рекламный бюджет, ниша, канал продаж, цель по заявкам. С прогнозом лидов и CPL в превью и персональным планом роста в подарок." },
  { label: "Подбор авто", prompt: "Квиз по подбору и пригону авто под ключ: бюджет, тип кузова, приоритеты, сроки. С подборкой подходящих лотов и ориентиром цены в превью и чек-листом проверки авто в подарок." },
  { label: "Стоматология / Клиника", prompt: "Квиз для премиальной стоматологической клиники (имплантация и виниры): задача, количество единиц, желаемые сроки. С предварительным планом и вилкой стоимости в превью и сертификатом на 3D-диагностику в подарок." },
];

const LANDING_PRESETS = [
  { label: "Подбор недвижимости", prompt: "Лендинг по продаже инвестиционной недвижимости (апартаменты и виллы): оффер, доходность, география и перевод в чат. Структура: герой, цифры, объекты, возражения, призыв." },
  { label: "Расчёт ремонта", prompt: "Лендинг студии ремонта под ключ: площадь, уровень отделки, срок и вилка цены. Структура: герой, этапы, смета, гарантия, призыв в чат." },
  { label: "B2B аудит / КП", prompt: "Лендинг маркетингового агентства: аудит бюджета, прогноз лидов и CPL, план роста. Структура: герой, боль, метод, кейсы, призыв." },
  { label: "Подбор авто", prompt: "Лендинг подбора и пригона авто под ключ: бюджет, кузов, проверка лота и ориентир цены. Структура: герой, процесс, гарантии, призыв в чат." },
  { label: "Стоматология / Клиника", prompt: "Лендинг премиальной стоматологии (имплантация и виниры): задача, срок, вилка стоимости и 3D-диагностика. Структура: герой, услуги, врачи, призыв." },
];

const PLACEHOLDER = {
  quiz: "Опишите нишу, гео и оффер — например: квиз по подбору вилл на Бали с расчётом доходности от 12% годовых и PDF-каталогом в конце…",
  landing: "Опишите продукт, аудиторию и цель лендинга — соберём структуру, оффер и визуал под ключ…",
} as const;

export function SitesHub({ sites, loadError }: { sites: LandingListItem[]; loadError: string | null }) {
  const router = useRouter();
  const field = useRef<HTMLTextAreaElement>(null);
  const [format, setFormat] = useState<(typeof SITE_FORMATS)[number]["id"]>("quiz");
  const [prompt, setPrompt] = useState("");
  const [preset, setPreset] = useState<ThemePreset>("dark_premium");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const presets = format === "landing" ? LANDING_PRESETS : QUIZ_PRESETS;
  const ready = SITE_FORMATS.filter((item) => item.available);
  const later = SITE_FORMATS.filter((item) => !item.available);
  const visible = useMemo(() => sites.filter((site) => {
    if (filter === "quiz" && site.siteType !== "quiz") return false;
    if (filter === "landing" && site.siteType !== "landing") return false;
    const haystack = `${site.title} ${site.subdomain ?? ""} ${site.slug}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [sites, filter, query]);

  async function generate() {
    const text = prompt.trim();
    if (text.length < 8 || busy || (format !== "quiz" && format !== "landing")) return;
    if (format === "landing") {
      router.push(`/funnels/builder?prompt=${encodeURIComponent(text)}`);
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/sites/generate-quiz", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: text, preset }),
    });
    const body = (await response.json()) as { id?: string; error?: string };
    setBusy(false);
    if (!response.ok || !body.id) {
      setError(body.error ?? "Не удалось собрать квиз.");
      return;
    }
    router.push(`/funnels/${body.id}`);
  }

  async function blank() {
    if (busy || (format !== "quiz" && format !== "landing")) return;
    setBusy(true);
    setError("");
    try {
      const result = format === "landing"
        ? await createManualLanding("Новый лендинг", preset)
        : await createManualQuiz("Новый квиз", preset);
      router.push(format === "landing" ? `/funnels/builder?id=${result.id}` : `/funnels/${result.id}`);
    } catch (cause) {
      setBusy(false);
      setError(cause instanceof Error ? cause.message : "Не удалось создать сайт.");
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pb-16 pt-10 text-[#09090b]">
      <h1 className="mb-7 text-[32px] font-semibold leading-tight tracking-[-0.03em] text-[#09090b] sm:text-[36px]"><span>Что запускаем?</span></h1>
      <div className="mb-6 flex items-end gap-7 overflow-x-auto border-b border-[#e4e4e7]/80 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ready.map((item) => {
          const active = format === item.id;
          return (
            <button key={item.id} type="button" className={`relative -mb-px shrink-0 pb-3 text-[15px] font-medium tracking-[-0.01em] transition-colors ${active ? "text-[#09090b]" : "text-[#71717a] hover:text-[#18181b]"}`} onClick={() => setFormat(item.id)}>
              <span>{item.label}</span>
              {active ? <span className="absolute inset-x-0 bottom-0 h-[2px] bg-[#09090b]" /> : null}
            </button>
          );
        })}
        <span className="mb-3.5 h-3.5 w-px shrink-0 bg-[#e4e4e7]" aria-hidden />
        {later.map((item) => (
          <button key={item.id} type="button" disabled aria-disabled="true" title="Раздел в разработке" className="inline-flex shrink-0 cursor-not-allowed select-none items-center gap-2 pb-3 text-[15px] font-medium tracking-[-0.01em] text-[#a1a1aa]/75 disabled:opacity-100">
            <span>{item.label}</span>
            <span className="rounded-md bg-[#f4f4f5]/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] text-[#a1a1aa]/80"><span>Скоро</span></span>
          </button>
        ))}
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void generate(); }}>
        <div className="rounded-2xl border border-[#e4e4e7]/90 bg-[#fff] shadow-[0_1px_2px_rgba(0,0,0,0.03),0_12px_32px_-16px_rgba(0,0,0,0.08)] transition-all duration-200 focus-within:border-[#a1a1aa] focus-within:shadow-[0_12px_36px_-14px_rgba(0,0,0,0.12)]">
          <textarea
            ref={field}
            value={prompt}
            placeholder={format === "landing" ? PLACEHOLDER.landing : PLACEHOLDER.quiz}
            className="min-h-[132px] w-full resize-none border-0 bg-transparent px-6 pb-4 pt-6 text-[16px] leading-relaxed text-[#09090b] outline-none placeholder:text-[#a1a1aa]"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void generate();
              }
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#f4f4f5] px-5 py-3.5">
            <div className="inline-flex items-center rounded-xl border border-[#e4e4e7]/60 bg-[#f4f4f5]/80 p-1" role="radiogroup" aria-label="Тема">
              {THEMES.map((item) => {
                const selected = preset === item.id;
                return (
                  <button key={item.id} type="button" role="radio" aria-checked={selected} className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${selected ? "bg-[#fff] text-[#09090b] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#71717a] hover:text-[#27272a]"}`} onClick={() => setPreset(item.id)}>
                    <span className={`h-2.5 w-2.5 rounded-full ${item.swatch}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="px-2.5 py-2 text-[13px] font-medium text-[#71717a] transition-colors hover:text-[#09090b] disabled:text-[#a1a1aa]" disabled={busy} onClick={() => void blank()}>
                <span>Пустой шаблон</span>
              </button>
              <button type="submit" disabled={busy || prompt.trim().length < 8} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#09090b] px-5 text-[14px] font-medium text-[#fff] transition-all hover:bg-[#27272a] disabled:bg-[#e4e4e7] disabled:text-[#a1a1aa]">
                {busy ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <ArrowRight className="h-[15px] w-[15px]" />}
                <span>{busy ? "Собираем…" : format === "landing" ? "Собрать лендинг" : "Собрать квиз"}</span>
              </button>
            </div>
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-[#cf0234]"><span>{error}</span></p> : null}
      </form>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <span className="mr-1 select-none text-[12px] font-medium text-[#a1a1aa]"><span>Примеры:</span></span>
        {presets.map((item) => {
          const active = prompt === item.prompt;
          return (
            <button key={item.label} type="button" className={`group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium transition-all duration-150 ${active ? "border-[#d4d4d8] bg-[#f4f4f5]/90 text-[#09090b]" : "border-[#e4e4e7]/75 bg-transparent text-[#52525b] hover:border-[#a1a1aa]/80 hover:bg-[#fff] hover:text-[#09090b]"}`} onClick={() => { setPrompt(item.prompt); field.current?.focus(); }}>
              <span>{item.label}</span>
              <ArrowUpRight className={`h-3 w-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${active ? "text-[#3f3f46]" : "text-[#a1a1aa] group-hover:text-[#3f3f46]"}`} />
            </button>
          );
        })}
      </div>

      <section className="mt-12 border-t border-[#e4e4e7]/70 pt-10">
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
              const address = site.subdomain ? getPublicSiteDisplayUrl(site.subdomain) : "";
              const publicUrl = site.subdomain ? getPublicSiteUrl(site.subdomain) : "";
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
                    {address ? <a href={publicUrl} target="_blank" rel="noopener noreferrer"><span>{address}</span></a> : <span>Адрес появится после публикации</span>}
                    {site.subdomain ? (
                      <button type="button" className="inline-flex items-center gap-1 text-[#cf0234]" onClick={() => void copyText(publicUrl).then((ok) => { if (!ok) return; setCopiedId(site.id); window.setTimeout(() => setCopiedId((current) => current === site.id ? null : current), 2000); })}>
                        {copiedId === site.id ? <Check className="h-3.5 w-3.5" /> : null}
                        <span>{copiedId === site.id ? "Скопировано ✓" : "Скопировать ссылку"}</span>
                      </button>
                    ) : null}
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
