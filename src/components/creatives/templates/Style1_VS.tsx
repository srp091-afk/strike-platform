import { Check, ChevronRight, X } from "lucide-react";

import { CreativeWrapper } from "@/components/creatives/CreativeWrapper";
import { DEFAULT_ACCENT_COLOR, resolveAccentHex, withAccentAlpha } from "@/lib/accent-color";
import { headlineFontClass } from "@/lib/studio-styles";
import type { CreativeTemplateProps } from "@/types/creatives";

const FAKE_PAINS = ["Нет системы", "Слив бюджета", "Хаос в заявках"];

export function Style1_VS({
  headline,
  subheadline,
  bullets,
  antiBullets,
  buttonText,
  images,
  accentColor,
  fontStyle,
  format = "4:5",
}: CreativeTemplateProps) {
  const accent = resolveAccentHex(accentColor, DEFAULT_ACCENT_COLOR);
  const beforeSrc = images[0] ?? "";
  const afterSrc = images[1] ?? images[0] ?? "";
  const stories = format === "9:16";
  const winItems = (bullets.length > 0 ? bullets : ["Чёткая система", "Заявки каждый день", "Контроль ROI"]).slice(
    0,
    4,
  );
  // Left ("before") list = anti_benefits generated as opposites of benefits;
  // legacy strategies without them fall back to the old hardcoded pains.
  const antiItems = (antiBullets ?? []).map((item) => item.trim()).filter(Boolean);
  const painItems = (antiItems.length > 0 ? antiItems : FAKE_PAINS).slice(0, Math.max(3, winItems.length));

  return (
    <CreativeWrapper format={format}>
      <article className="relative flex h-full w-full flex-col overflow-hidden bg-black text-white">
        <header className={`shrink-0 bg-black px-10 pb-6 text-center ${stories ? "pt-24" : "pt-10"}`}>
          <h1 className={`${headlineFontClass(fontStyle)} text-6xl leading-none tracking-wide text-white uppercase`}>{headline}</h1>
          {subheadline ? (
            <p className="mt-3 font-montserrat text-2xl font-semibold leading-snug" style={{ color: accent }}>
              {subheadline}
            </p>
          ) : null}
        </header>

        <div className="relative min-h-0 flex-1">
          <div className="grid h-full grid-cols-2">
            <div className="relative overflow-hidden">
              {beforeSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={beforeSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-zinc-800" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <span className="absolute left-6 top-6 rounded-md bg-black/70 px-3 py-1 font-montserrat text-sm font-bold tracking-widest text-zinc-300 uppercase">
                До
              </span>
            </div>
            <div className="relative overflow-hidden">
              {afterSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={afterSrc} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-zinc-700" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
              <span className="absolute right-6 top-6 rounded-md bg-black/70 px-3 py-1 font-montserrat text-sm font-bold tracking-widest text-white uppercase">
                После
              </span>
            </div>
          </div>

          <div
            className="absolute left-1/2 top-1/2 z-20 grid size-24 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 bg-black font-anton text-4xl tracking-wider text-white"
            style={{ borderColor: accent }}
          >
            VS
          </div>

          <div className="absolute inset-x-6 bottom-6 z-10 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-zinc-600/60 bg-zinc-900/75 p-5 backdrop-blur-md">
              <p className="mb-3 text-center font-montserrat text-sm font-bold tracking-[0.18em] text-red-500 uppercase">
                Обычный подход
              </p>
              <ul className="space-y-3">
                {painItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 font-montserrat text-lg leading-snug text-zinc-300">
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-red-600 text-white">
                      <X className="size-4" strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border-2 bg-black/70 p-5 backdrop-blur-md" style={{ borderColor: accent }}>
              <p
                className="mb-3 text-center font-montserrat text-sm font-bold tracking-[0.18em] uppercase"
                style={{ color: accent }}
              >
                Наш стандарт
              </p>
              <ul className="space-y-3">
                {winItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 font-montserrat text-lg leading-snug text-white">
                    <span
                      className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full"
                      style={{ backgroundColor: withAccentAlpha(accent, 0.2), color: accent }}
                    >
                      <Check className="size-4" strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <footer className={`shrink-0 bg-black px-10 ${stories ? "pt-6 pb-28" : "py-8"}`}>
          <div
            className="flex w-full items-center justify-center gap-3 rounded-2xl px-8 py-6"
            style={{ backgroundColor: accent, boxShadow: `0 0 48px ${withAccentAlpha(accent, 0.45)}` }}
          >
            <p
              className={`${headlineFontClass(fontStyle)} text-center text-5xl leading-none tracking-wide text-black uppercase`}
            >
              {buttonText}
            </p>
            <ChevronRight className="size-12 shrink-0 text-black" strokeWidth={3.5} />
          </div>
        </footer>
      </article>
    </CreativeWrapper>
  );
}
