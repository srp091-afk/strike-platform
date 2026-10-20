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
  format = "4:5",
}: CreativeTemplateProps) {
  const accent = resolveAccentHex(accentColor, DEFAULT_ACCENT_COLOR);
  const leftSrc = images[0] ?? "";
  const rightSrc = images[1] ?? images[0] ?? "";
  const items = (bullets.length > 0 ? bullets : ["Быстрый результат", "Прозрачная система"]).slice(0, 4);
  // Strict conditional badge: empty/whitespace hides the plate completely.
  const badgeLabel = badge?.trim() ?? "";
  const stories = format === "9:16";

  return (
    <CreativeWrapper format={format}>
      <article className="relative flex h-full w-full flex-col overflow-hidden bg-black text-white">
        <header className="shrink-0 bg-black p-6 text-center">
          {subheadline ? (
            <p
              className="font-montserrat text-lg font-semibold tracking-[0.14em] uppercase"
              style={{ color: accent }}
            >
              {subheadline}
            </p>
          ) : null}
          <h1 className={`mt-3 ${headlineFontClass(fontStyle)} text-6xl leading-[0.9] tracking-wide text-white uppercase sm:text-7xl`}>
            {headline}
          </h1>
        </header>

        <div className="relative min-h-0 flex-1">
          <div className="grid h-full grid-cols-2">
            <div className="relative overflow-hidden">
              {leftSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={leftSrc} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full bg-zinc-800" />
              )}
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

          <div className="absolute bottom-0 w-full bg-black/80 p-4 backdrop-blur-sm">
            <ul className="grid grid-cols-2 gap-2">
              {items.map((item) => (
                <li key={item} className="flex items-start gap-2 font-montserrat text-base leading-snug text-white">
                  <Check className="mt-0.5 size-5 shrink-0" strokeWidth={3} style={{ color: accent }} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <footer
          className={`flex shrink-0 items-center gap-4 bg-black p-4 ${badgeLabel ? "justify-between" : "justify-center"} ${stories ? "pb-16" : ""}`}
        >
          {badgeLabel ? (
            <div
              className="inline-flex items-center gap-2 rounded-xl px-4 py-3 font-montserrat text-sm font-bold tracking-wide text-black uppercase"
              style={{ backgroundColor: accent }}
            >
              <Gift className="size-4 shrink-0" strokeWidth={2.5} />
              {badgeLabel}
            </div>
          ) : null}
          <div
            className="rounded-xl px-8 py-4 font-anton text-2xl tracking-wide text-black uppercase"
            style={{ backgroundColor: accent }}
          >
            {buttonText}
          </div>
        </footer>
      </article>
    </CreativeWrapper>
  );
}
