"use client";

import { Globe, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import {
  creativeLanguages,
  fontStyles,
  studioStyles,
  styleFilters,
  type CreativeLanguage,
  type FontStyle,
  type StudioStyleKey,
} from "@/lib/studio-styles";
import { cn } from "@/lib/utils";

type StyleTemplate = {
  id: string;
  name: string;
  category: string;
  preview_url: string;
};

export function AdStyleStudio({
  briefSummary,
  strategyJson,
  strategyPending,
  strategyError,
  createError,
  templates,
  creating,
  onBack,
}: {
  briefSummary: string;
  strategyJson: string;
  strategyPending: boolean;
  strategyError: string | null;
  createError: string | null;
  templates: StyleTemplate[];
  creating: boolean;
  onBack: () => void;
}) {
  const [creativesCount, setCreativesCount] = useState(3);
  const [creativeLanguage, setCreativeLanguage] = useState<CreativeLanguage>("ru");
  const [fontStyle, setFontStyle] = useState<FontStyle>("premium");
  const [category, setCategory] = useState<(typeof styleFilters)[number]>("Все");
  const [selectedStyle, setSelectedStyle] = useState<StudioStyleKey>("dark-editorial-grid");

  const highlights = useMemo(
    () => readBriefHighlights(briefSummary, strategyJson),
    [briefSummary, strategyJson],
  );
  const visibleStyles = studioStyles.filter((style) => category === "Все" || style.category === category);

  useEffect(() => {
    if (visibleStyles.some((style) => style.key === selectedStyle)) return;
    const next = visibleStyles[0];
    if (next) setSelectedStyle(next.key);
  }, [category, selectedStyle]);

  const selected = studioStyles.find((style) => style.key === selectedStyle) ?? studioStyles[0];
  const templateId = templateIdFor(selected.category, templates);
  const font = fontStyles.find((item) => item.value === fontStyle) ?? fontStyles[0];
  const totalCredits = creativesCount * 10;
  const dollarCost = (creativesCount * 0.4).toFixed(2);

  return (
    <>
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="creatives_count" value={String(creativesCount)} />
      <input type="hidden" name="creative_language" value={creativeLanguage} />
      <input type="hidden" name="font_style" value={fontStyle} />
      <input type="hidden" name="style_key" value={selected.key} />
      <input type="hidden" name="style_name" value={selected.name} />

      {strategyError ? (
        <Alert variant="destructive" className="lg:col-span-12">
          <AlertTitle>Стратегия не собралась</AlertTitle>
          <AlertDescription>{strategyError} Можно сохранить кампанию — соберём её ещё раз.</AlertDescription>
        </Alert>
      ) : null}
      {createError ? (
        <Alert variant="destructive" className="lg:col-span-12">
          <AlertTitle>Проект не создан</AlertTitle>
          <AlertDescription>{createError}</AlertDescription>
        </Alert>
      ) : null}

      <aside className="rounded-2xl border border-zinc-800/80 bg-zinc-950/60 p-6 backdrop-blur-md lg:col-span-4">
        <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Sparkles className="size-3.5" />
          Ключевая выжимка
        </h2>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Продукт / Ниша</p>
          <p className="mt-1 text-sm font-semibold text-zinc-100">{highlights.product}</p>
        </div>
        <div className="my-4 border-t border-zinc-800/60" />
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Целевая аудитория</p>
          {highlights.audience ? (
            <p className="mt-1 text-sm leading-relaxed text-zinc-200">{highlights.audience}</p>
          ) : (
            <span className="mt-2 block h-10 animate-pulse rounded-md bg-zinc-800/80" />
          )}
        </div>
        <div className="my-4 border-t border-zinc-800/60" />
        <div className="mt-1 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Ключевой оффер</p>
          {highlights.offer ? (
            <p className="mt-0.5 text-sm font-medium text-zinc-100">{highlights.offer}</p>
          ) : (
            <span className="mt-2 block h-8 animate-pulse rounded-md bg-amber-500/10" />
          )}
        </div>
      </aside>

      <section className="grid min-w-0 gap-6 lg:col-span-8">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Количество</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((count) => {
                const active = count === creativesCount;
                return (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "h-10 flex-1 rounded-lg text-sm",
                      active ? "bg-white font-bold text-black" : "border border-zinc-800 bg-zinc-900 text-zinc-400",
                    )}
                    onClick={() => setCreativesCount(count)}
                  >
                    {count}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Язык</p>
            <div className="relative">
              <Globe className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
              <SelectField
                value={creativeLanguage}
                options={creativeLanguages.map((language) => ({ value: language.value, label: language.label }))}
                className="h-10 rounded-lg py-2 pr-8 pl-9"
                onChange={(value) => {
                  if (creativeLanguages.some((language) => language.value === value)) {
                    setCreativeLanguage(value as CreativeLanguage);
                  }
                }}
              />
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-400">Типографика</p>
            <SelectField
              value={fontStyle}
              options={fontStyles.map((style) => ({ value: style.value, label: style.label }))}
              className="h-10 rounded-lg px-3 py-2"
              onChange={(value) => {
                if (fontStyles.some((style) => style.value === value)) setFontStyle(value as FontStyle);
              }}
            />
            <p className="mt-1.5 text-[11px] text-zinc-500">{font.pair}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {styleFilters.map((filter) => {
            const active = filter === category;
            return (
              <button
                key={filter}
                type="button"
                aria-pressed={active}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm",
                  active ? "bg-white font-semibold text-black" : "border border-zinc-800 bg-zinc-900 text-zinc-400",
                )}
                onClick={() => setCategory(filter)}
              >
                {filter}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {visibleStyles.map((style) => {
            const active = style.key === selectedStyle;
            return (
              <button
                key={style.key}
                type="button"
                aria-pressed={active}
                className={cn(
                  "overflow-hidden rounded-xl border-2 bg-zinc-950 text-left transition-colors",
                  active ? "border-white ring-2 ring-white/20" : "border-zinc-800 hover:border-zinc-500",
                )}
                onClick={() => setSelectedStyle(style.key)}
              >
                {style.key === "dark-editorial-grid" ? <EditorialPreview /> : <LuxuryPreview />}
                <span className="block px-3 pt-3 text-sm font-medium text-white">{style.name}</span>
                <span className="block px-3 pt-1 pb-3 text-xs text-zinc-500">{style.note}</span>
              </button>
            );
          })}
        </div>
        {!templateId ? (
          <p className="text-sm text-zinc-500">В базе нет активного шаблона, к которому можно привязать стиль.</p>
        ) : null}
      </section>

      <footer className="flex flex-col gap-3 border-t border-zinc-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-12">
        <div className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5">
          <span className="text-sm text-zinc-300">Списание:</span>
          <span className="font-mono font-bold text-amber-400">
            {totalCredits} кредитов · ~${dollarCost}
          </span>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" className="text-zinc-400 hover:text-white" onClick={onBack}>
            Назад
          </Button>
          <Button
            type="submit"
            disabled={!templateId || creating || strategyPending}
            className="rounded-xl bg-white px-6 py-2.5 font-bold text-black shadow-lg hover:bg-zinc-200"
          >
            {strategyPending
              ? "Собираем стратегию"
              : creating
                ? "Сохраняем кампанию"
                : `Сгенерировать кампанию (${creativesCount})`}
          </Button>
        </div>
      </footer>
    </>
  );
}

function EditorialPreview() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-[#0A0A0A] text-white">
      <div className="absolute inset-3 border border-white/20" />
      <div className="absolute top-3 bottom-3 left-[58%] border-l border-white/20" />
      <div className="absolute top-[62%] right-3 left-3 border-t border-white/20" />
      <span className="absolute top-6 left-6 bg-white px-1.5 py-0.5 text-[9px] font-bold tracking-[0.16em] text-black uppercase">
        01
      </span>
      <div className="absolute top-[28%] right-[46%] left-6">
        <p className="text-[10px] tracking-[0.22em] text-zinc-500 uppercase">Editorial</p>
        <p className="mt-2 text-lg leading-none font-semibold tracking-tight">Сетка держит взгляд</p>
      </div>
      <div className="absolute top-6 right-6 bottom-[42%] left-[62%] bg-zinc-800" />
      <p className="absolute right-6 bottom-6 left-6 text-[10px] tracking-wide text-zinc-400 uppercase">Оффер · 90 дней</p>
    </div>
  );
}

function LuxuryPreview() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-b from-zinc-800 via-black to-zinc-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(255,255,255,0.14),transparent_46%)]" />
      <div className="absolute inset-x-7 top-8 h-px bg-white/25" />
      <div className="absolute inset-x-7 bottom-8 h-px bg-white/25" />
      <div className="absolute inset-x-10 top-1/2 -translate-y-1/2 text-center">
        <p className="text-[10px] tracking-[0.32em] text-zinc-400 uppercase">Atelier</p>
        <p className="mt-3 text-xl font-light tracking-[0.18em] text-zinc-100 uppercase">Материал</p>
        <p className="mx-auto mt-4 h-px w-10 bg-white/40" />
      </div>
    </div>
  );
}

function templateIdFor(category: string, templates: StyleTemplate[]) {
  const needle = category.toLowerCase();
  const matched = templates.find((template) => template.category.toLowerCase().includes(needle));
  return matched?.id ?? templates[0]?.id ?? "";
}

function readBriefHighlights(summary: string, strategyJson: string) {
  const clean = summary.replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  const strategy = readStrategyBits(strategyJson);
  return {
    product: clip(sentences[0] || clean || "Продукт уточняется", 180),
    audience: strategy?.audience || "",
    offer: strategy?.offer || "",
  };
}

function readStrategyBits(raw: string) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as {
      strategy?: { target_audience_insight?: unknown; core_offer_angle?: unknown };
    };
    const audience =
      typeof parsed.strategy?.target_audience_insight === "string" ? parsed.strategy.target_audience_insight.trim() : "";
    const offer = typeof parsed.strategy?.core_offer_angle === "string" ? parsed.strategy.core_offer_angle.trim() : "";
    if (!audience && !offer) return null;
    return { audience: clip(audience, 360), offer: clip(offer, 280) };
  } catch {
    return null;
  }
}

function clip(value: string, max: number) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > 40 ? cut.slice(0, space) : cut).trim()}…`;
}
