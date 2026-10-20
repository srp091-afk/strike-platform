import { Check, Gift } from "lucide-react";

import { CreativeWrapper } from "@/components/creatives/CreativeWrapper";
import { DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import { headlineFontClass } from "@/lib/studio-styles";
import type { CreativeTemplateProps } from "@/types/creatives";

export function Style2_SplitAction({
  headline,
  subheadline,
  bullets,
  badge,
  buttonText,
  images,
  accentColor,
  fontStyle,
  overlayText,
  format = "4:5",
}: CreativeTemplateProps) {
  const accent = resolveAccentHex(accentColor, DEFAULT_ACCENT_COLOR);
  const leftSrc = images[0] ?? "";
  const rightSrc = images[1] ?? images[0] ?? "";
  const items = (bullets.length > 0 ? bullets : ["Быстрый результат", "Прозрачная система"]).slice(0, 4);
  // Strict conditional badge: empty/whitespace hides the footer offer part.
  const badgeLabel = badge?.trim() ?? "";
  const overlayLabel = overlayText?.trim() ?? "";
  const stories = format === "9:16";

  return (
    <CreativeWrapper format={format}>
      <article className="relative flex h-full w-full flex-col overflow-hidden bg-black text-white">
        <header className={`shrink-0 bg-black px-8 text-center ${stories ? "pt-20 pb-6" : "pt-8 pb-6"}`}>
          {badgeLabel ? (
            <p
              className="font-montserrat text-xl font-bold tracking-[0.18em] uppercase"
              style={{ color: accent }}
            >
              {badgeLabel}
            </p>
          ) : null}
          <h1
            className={`${badgeLabel ? "mt-3" : ""} ${headlineFontClass(fontStyle)} text-7xl leading-[0.95] tracking-wide text-white uppercase`}
          >
            {headline}
          </h1>
          {subheadline ? (
            <p className="mt-3 font-montserrat text-2xl font-semibold leading-snug text-white uppercase">
              {subheadline}
            </p>
          ) : null}
        </header>

        <div className="relative min-h-0 flex-1">
          <div className="grid h-full grid-cols-2">
            <div className="relative overflow-hidden">
              {leftSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={leftSrc} alt="" className="h-full w-full object-cover grayscale" />
              ) : (
                <div className="h-full w-full bg-zinc-800" />
              )}
              <div className="absolute inset-0 bg-black/25" />
            </div>
            <div className="relative overflow-hidden">
              {rightSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={rightSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-zinc-700" />
              )}
            </div>
          </div>

          {/* Bottom overlay: claim line + 2x2 benefit grid on a dark plate. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-8 pt-14 pb-6">
            <div className="rounded-2xl bg-black/80 px-6 py-5 backdrop-blur-sm">
              {overlayLabel ? (
                <p className="mb-4 text-center font-montserrat text-xl leading-snug font-medium text-white">
                  {overlayLabel}
                </p>
              ) : null}
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
                {items.map((item) => (
                  <li key={item} className="flex items-start gap-2 font-montserrat text-base leading-snug text-white">
                    <Check className="mt-0.5 size-5 shrink-0" strokeWidth={3} style={{ color: accent }} />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Monolith accent footer: offer (left) + CTA button (right). */}
        <footer
          className={`flex shrink-0 items-center gap-4 px-8 py-5 ${badgeLabel ? "justify-between" : "justify-end"} ${stories ? "pb-24" : ""}`}
          style={{ backgroundColor: accent }}
        >
          {badgeLabel ? (
            <div className="flex min-w-0 items-center gap-3 text-left font-montserrat text-lg leading-tight font-bold text-black uppercase">
              <Gift className="size-8 shrink-0" strokeWidth={2.5} />
              <span>{badgeLabel}</span>
            </div>
          ) : null}
          <div
            className={`${headlineFontClass(fontStyle)} shrink-0 rounded-xl bg-black px-8 py-4 text-3xl tracking-wide text-white uppercase`}
          >
            {buttonText}
          </div>
        </footer>
      </article>
    </CreativeWrapper>
  );
}
