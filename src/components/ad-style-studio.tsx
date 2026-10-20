"use client";

import { Globe, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";

import { AccentColorField, DEFAULT_ACCENT_COLOR } from "@/components/accent-color-field";
import { GenerationCostBadge } from "@/components/generation-cost-badge";
import { StylePackPicker } from "@/components/style-pack-picker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import type { AdFormattedBrief } from "@/lib/ad-types";
import type { CreativeTemplate } from "@/lib/creative-templates";
import {
  creativeLanguages,
  fontStyles,
  type CreativeLanguage,
  type FontStyle,
} from "@/lib/studio-styles";
import { cn } from "@/lib/utils";

export function AdStyleStudio({
  formattedBrief,
  formattedPending,
  strategyPending,
  strategyError,
  createError,
  templates,
  creating,
  generating,
  onBack,
}: {
  formattedBrief: AdFormattedBrief | null;
  formattedPending: boolean;
  strategyPending: boolean;
  strategyError: string | null;
  createError: string | null;
  /** Style list loaded from Supabase `creative_templates` (server-side). */
  templates: CreativeTemplate[];
  creating: boolean;
  generating: boolean;
  onBack: () => void;
}) {
  const busy = creating || generating;
  const [creativesCount, setCreativesCount] = useState(3);
  const [creativeLanguage, setCreativeLanguage] = useState<CreativeLanguage>("ru");
  const [fontStyle, setFontStyle] = useState<FontStyle>("premium");
  // Slot-based pack: one creative_templates UUID per generated creative (≤ quantity).
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);

  const primaryTemplateId = selectedStyles[0] ?? "";
  const selected = templates.find((template) => template.id === primaryTemplateId) ?? null;
  const templateId = selected?.id ?? "";
  const font = fontStyles.find((item) => item.value === fontStyle) ?? fontStyles[0];
  const packComplete = selectedStyles.length === creativesCount;
  const remaining = creativesCount - selectedStyles.length;

  function changeCount(count: number) {
    setCreativesCount(count);
    setSelectedStyles((current) => current.slice(0, count));
  }

  return (
    <>
      <input type="hidden" name="template_id" value={templateId} />
      <input type="hidden" name="creatives_count" value={String(creativesCount)} />
      <input type="hidden" name="creative_language" value={creativeLanguage} />
      <input type="hidden" name="font_style" value={fontStyle} />
      <input type="hidden" name="style_key" value={templateId} />
      <input type="hidden" name="style_ids" value={JSON.stringify(selectedStyles)} />
      <input type="hidden" name="style_name" value={selected?.name ?? ""} />
      <input type="hidden" name="accent_color" value={accentColor} />

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
        <BriefFact label="Продукт / Ниша" value={formattedBrief?.product} pending={formattedPending} />
        <div className="my-4 border-t border-zinc-800/60" />
        <BriefFact label="Целевая аудитория" value={formattedBrief?.audience} pending={formattedPending} />
        <div className="my-4 border-t border-zinc-800/60" />
        <BriefFact label="Ключевые преимущества" value={formattedBrief?.key_advantages} pending={formattedPending} />
        <div className="my-4 border-t border-zinc-800/60" />
        <BriefFact
          label="Спецпредложение и Триггер (УТП)"
          value={formattedBrief?.offer}
          pending={formattedPending}
          hint="Акция, подарок или ограничение из последнего ответа брифа"
        />
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
                    onClick={() => changeCount(count)}
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

        <AccentColorField value={accentColor} onChange={setAccentColor} disabled={busy} />

        {templates.length === 0 ? (
          <p className="text-sm text-zinc-500">В базе нет активных стилей (таблица creative_templates пуста).</p>
        ) : (
          <StylePackPicker
            templates={templates}
            quantity={creativesCount}
            selectedStyles={selectedStyles}
            onChange={setSelectedStyles}
            disabled={busy}
          />
        )}
      </section>

      <footer className="flex flex-col gap-3 border-t border-zinc-800/80 pt-4 sm:flex-row sm:items-center sm:justify-between lg:col-span-12">
        <GenerationCostBadge creativesCount={creativesCount} />
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            className="text-zinc-400 hover:text-white"
            disabled={busy}
            onClick={onBack}
          >
            Назад
          </Button>
          <Button
            type="submit"
            disabled={!packComplete || busy || strategyPending}
            className="rounded-xl bg-white px-6 py-2.5 font-bold text-black shadow-lg hover:bg-zinc-200 disabled:opacity-40"
          >
            {strategyPending
              ? "Собираем стратегию"
              : generating
                ? "Генерируем креативы"
                : creating
                  ? "Сохраняем кампанию"
                  : !packComplete
                    ? `Выберите ещё ${remaining} ${remaining === 1 ? "стиль" : "стиля"}`
                    : "Сгенерировать пак"}
          </Button>
        </div>
      </footer>

      {generating ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label="Генерация креативов"
        >
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center shadow-2xl">
            <Loader2 className="mx-auto size-10 animate-spin text-white" />
            <p className="mt-5 text-base font-semibold text-white">Генерируем креативы</p>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Арт-директор собирает тексты и промпты. Обычно 15–30 секунд.
            </p>
            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-white" />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BriefFact({
  label,
  value,
  pending,
  hint,
}: {
  label: string;
  value?: string;
  pending: boolean;
  hint?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-zinc-500">{label}</p>
      {value ? (
        <p className="text-sm leading-relaxed text-zinc-200">{value}</p>
      ) : pending ? (
        <span className="mt-1 block h-10 animate-pulse rounded-md bg-zinc-800/80" />
      ) : (
        <p className="text-sm leading-relaxed text-zinc-200">—</p>
      )}
      {hint ? <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">{hint}</p> : null}
    </div>
  );
}
