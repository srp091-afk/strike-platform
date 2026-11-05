"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";

import { updateProjectSettings } from "@/app/actions/smm-projects";
import { CARD, SectionTitle } from "@/components/smm/smm-view";
import { toast } from "@/components/ui/toaster";
import { SMM_BRAND_COLOR_PATTERN, SMM_BRAND_FONTS, SMM_BRAND_TEXT_MAX, type SmmProjectSettings } from "@/lib/smm-project-types";
import { cn } from "@/lib/utils";

const LABEL = "block text-xs font-semibold uppercase tracking-widest text-gray-500";
const FIELD =
  "mt-3 w-full rounded-xl border border-gray-200 bg-[#ffffff] px-4 py-3 text-sm text-[#0b0b0f] outline-none transition-colors placeholder:text-gray-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100";

export function BrandSettingsForm({ projectId, initial }: { projectId: string; initial: SmmProjectSettings }) {
  const [toneOfVoice, setToneOfVoice] = useState(initial.toneOfVoice);
  const [targetAudience, setTargetAudience] = useState(initial.targetAudience);
  const [brandColor, setBrandColor] = useState(initial.brandColor);
  const [brandFont, setBrandFont] = useState(initial.brandFont);
  const [isSubmitting, startTransition] = useTransition();

  const colorValid = SMM_BRAND_COLOR_PATTERN.test(brandColor);

  function submit() {
    if (!colorValid) {
      toast.error("Цвет должен быть в формате #RRGGBB.");
      return;
    }
    startTransition(async () => {
      const result = await updateProjectSettings(projectId, { toneOfVoice, targetAudience, brandColor, brandFont });
      if (result.ok) toast.success("Настройки бренда сохранены");
      else toast.error(result.error);
    });
  }

  return (
    <div>
      <SectionTitle title="Настройки бренда" text="Голос, аудитория и визуальный стиль проекта. Используются при генерации текстов, субтитров и плашек." />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className={cn(CARD, "mt-6 space-y-7 p-6 sm:p-8")}
      >
        <div>
          <label htmlFor="tone" className={LABEL}>
            Tone of Voice (Голос бренда)
          </label>
          <textarea
            id="tone"
            value={toneOfVoice}
            onChange={(event) => setToneOfVoice(event.target.value)}
            maxLength={SMM_BRAND_TEXT_MAX}
            rows={4}
            placeholder="Например: дерзкий, экспертный, с юмором"
            className={cn(FIELD, "resize-y leading-6")}
          />
        </div>

        <div>
          <label htmlFor="audience" className={LABEL}>
            Целевая аудитория
          </label>
          <textarea
            id="audience"
            value={targetAudience}
            onChange={(event) => setTargetAudience(event.target.value)}
            maxLength={SMM_BRAND_TEXT_MAX}
            rows={4}
            placeholder="Например: владельцы малого бизнеса 25–45 лет, интересуются автоматизацией"
            className={cn(FIELD, "resize-y leading-6")}
          />
        </div>

        <div className="grid grid-cols-1 gap-7 sm:grid-cols-2">
          <div>
            <label htmlFor="color" className={LABEL}>
              Фирменный цвет для субтитров и плашек
            </label>
            <div className="mt-3 flex items-center gap-3">
              <input
                id="color"
                type="color"
                value={colorValid ? brandColor : "#000000"}
                onChange={(event) => setBrandColor(event.target.value)}
                aria-label="Выбрать цвет"
                className="h-12 w-16 shrink-0 cursor-pointer rounded-xl border border-gray-200 bg-[#ffffff] p-1"
              />
              <input
                value={brandColor}
                onChange={(event) => setBrandColor(event.target.value)}
                maxLength={7}
                spellCheck={false}
                aria-label="HEX-код цвета"
                className={cn(FIELD, "mt-0 font-mono uppercase", !colorValid && "border-rose-400")}
              />
            </div>
          </div>

          <div>
            <label htmlFor="font" className={LABEL}>
              Шрифт субтитров
            </label>
            <select id="font" value={brandFont} onChange={(event) => setBrandFont(event.target.value)} className={FIELD}>
              {SMM_BRAND_FONTS.map((font) => (
                <option key={font} value={font}>
                  {font}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <p className={LABEL}>Предпросмотр</p>
          <p
            className="mt-3 inline-block rounded-lg px-4 py-2 text-xl font-bold text-[#ffffff]"
            style={{ backgroundColor: colorValid ? brandColor : "#000000", fontFamily: `"${brandFont}", sans-serif` }}
          >
            Так будут выглядеть субтитры
          </p>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3 text-sm font-semibold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" strokeWidth={2} /> : <Check className="size-4" strokeWidth={2.5} />}
            {isSubmitting ? "Сохраняем…" : "Сохранить настройки"}
          </button>
        </div>
      </form>
    </div>
  );
}
