import { ArrowRight, Calendar, Check, X } from "lucide-react";

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
  badge,
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
  // Left ("before") list = anti_benefits from the strategy (opposites of the
  // benefits). The hardcoded pains are ONLY a last-resort fallback for legacy
  // strategies that predate anti_benefits.
  const rawWins = bullets.map((item) => item.trim()).filter(Boolean);
  const rawPains = antiBullets?.map((item) => item.trim()).filter(Boolean) ?? [];
  const winSource = rawWins.length > 0 ? rawWins : ["Чёткая система", "Заявки каждый день", "Контроль ROI"];
  const painSource = rawPains.length > 0 ? rawPains : FAKE_PAINS;
  // Both panels always show the SAME number of rows (trimmed to the shorter
  // list, max 4) so the two cards stay exactly the same height.
  const pairCount = Math.min(4, winSource.length, painSource.length);
  const winItems = winSource.slice(0, pairCount);
  const painItems = painSource.slice(0, pairCount);
  // Strict conditional badge: empty/whitespace hides the footer offer part.
  const badgeLabel = badge?.trim() ?? "";

  return (
    <CreativeWrapper format={format}>
      <article className="relative flex h-full w-full flex-col overflow-hidden bg-black text-white">
        <header className={`shrink-0 bg-black px-10 pb-6 text-center ${stories ? "pt-24" : "pt-10"}`}>
          <h1 className={`${headlineFontClass(fontStyle)} text-7xl leading-none tracking-wide text-white uppercase`}>{headline}</h1>
          {subheadline ? (
            <p className="mt-4 font-montserrat text-[32px] leading-snug font-semibold" style={{ color: accent }}>
              {subheadline}
            </p>
          ) : null}
        </header>

        <div className="relative min-h-0 flex-1">
          <div className="grid h-full grid-cols-2">
            <div className="relative overflow-hidden">
              {beforeSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={beforeSrc} alt="" className="absolute inset-0 h-full w-full object-cover grayscale brightness-75" />
              ) : (
                <div className="absolute inset-0 bg-zinc-800" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
              <span className="absolute top-6 left-6 rounded-md bg-black/70 px-4 py-1.5 font-montserrat text-lg font-bold tracking-widest text-zinc-300 uppercase">
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
              <span className="absolute top-6 right-6 rounded-md bg-black/70 px-4 py-1.5 font-montserrat text-lg font-bold tracking-widest text-white uppercase">
                После
              </span>
            </div>
          </div>

          {/* Strict center seam between the two photos. */}
          <div className="absolute top-0 bottom-0 left-1/2 z-10 w-[2px] -translate-x-1/2 bg-white/20" />

          <div
            className="absolute top-1/2 left-1/2 z-20 grid size-36 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 bg-black font-anton text-6xl tracking-wider text-white"
            style={{ borderColor: accent }}
          >
            VS
          </div>

          <div className="absolute inset-x-6 bottom-6 z-10 grid grid-cols-2 items-stretch gap-4">
            <div className="h-full rounded-2xl border border-zinc-600/60 bg-zinc-900/75 px-6 py-6 backdrop-blur-md">
              <p className={`mb-4 text-center ${headlineFontClass(fontStyle)} text-[34px] leading-none tracking-[0.14em] text-red-500 uppercase`}>
                Обычный подход
              </p>
              <ul className="space-y-3.5">
                {painItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 font-montserrat text-[27px] leading-snug text-zinc-300">
                    <span className="mt-1 grid size-9 shrink-0 place-items-center rounded-full bg-red-600 text-white">
                      <X className="size-5" strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="h-full rounded-2xl border-2 bg-black/70 px-6 py-6 backdrop-blur-md" style={{ borderColor: accent }}>
              <p
                className={`mb-4 text-center ${headlineFontClass(fontStyle)} text-[34px] leading-none tracking-[0.14em] uppercase`}
                style={{ color: accent }}
              >
                Наш стандарт
              </p>
              <ul className="space-y-3.5">
                {winItems.map((item) => (
                  <li key={item} className="flex items-start gap-3 font-montserrat text-[27px] leading-snug text-white">
                    <span
                      className="mt-1 grid size-9 shrink-0 place-items-center rounded-full"
                      style={{ backgroundColor: withAccentAlpha(accent, 0.2), color: accent }}
                    >
                      <Check className="size-5" strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Monolith black footer: offer on the left, CTA on the right. */}
        <footer
          className={`flex w-full shrink-0 items-center gap-5 border-t-2 bg-black px-6 py-5 ${badgeLabel ? "justify-between" : "justify-end"} ${stories ? "pb-24" : ""}`}
          style={{ borderTopColor: accent }}
        >
          {badgeLabel ? (
            <div className="flex min-w-0 items-center gap-3 text-left font-montserrat text-2xl font-bold tracking-wide text-white uppercase">
              <Calendar className="size-10 shrink-0" strokeWidth={2.4} style={{ color: accent }} />
              <span>{badgeLabel}</span>
            </div>
          ) : null}
          <div
            className={`flex shrink-0 items-center gap-3 ${headlineFontClass(fontStyle)} text-6xl leading-none tracking-wide text-white uppercase`}
          >
            <span>{buttonText}</span>
            <ArrowRight className="size-11 shrink-0" strokeWidth={3} style={{ color: accent }} />
          </div>
        </footer>
      </article>
    </CreativeWrapper>
  );
}
