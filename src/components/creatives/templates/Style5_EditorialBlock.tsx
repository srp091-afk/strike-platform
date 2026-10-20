import { ArrowRight, BadgeDollarSign, Calendar, FileSignature, MessageCircle, Package } from "lucide-react";
import type { ComponentType } from "react";

import { CreativeWrapper } from "@/components/creatives/CreativeWrapper";
import { accentTextColor, DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import { headlineFontClass } from "@/lib/studio-styles";
import type { CreativeTemplateProps } from "@/types/creatives";

/** Premium icon rotation for the white benefit strip. */
const BENEFIT_ICONS: ComponentType<{ className?: string; style?: React.CSSProperties; strokeWidth?: number }>[] = [
  BadgeDollarSign,
  FileSignature,
  MessageCircle,
  Package,
];

export function Style5_EditorialBlock({
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
  const onAccent = accentTextColor(accent);
  const bg = images[0] ?? "";
  const items = (bullets.length > 0 ? bullets : ["Результат", "Система", "Контроль", "Масштаб"]).slice(0, 4);
  // Strict conditional badge: empty/whitespace hides the footer offer part.
  const badgeLabel = badge?.trim() ?? "";
  const stories = format === "9:16";

  // Optional editorial touch: the last headline word takes the accent color.
  const words = headline.trim().split(/\s+/).filter(Boolean);
  const lastWord = words.length > 1 ? words[words.length - 1] : null;
  const headWords = lastWord ? words.slice(0, -1).join(" ") : headline;

  return (
    <CreativeWrapper format={format}>
      <article className="flex h-full w-full flex-col overflow-hidden bg-white text-black">
        {/* Upper floor (~67%): black text column + clean photo, no overlays. */}
        <div className="flex min-h-0 flex-[0_0_67%] flex-row">
          <div className="flex w-[45%] shrink-0 flex-col justify-center bg-black p-8">
            <h1 className={`${headlineFontClass(fontStyle)} text-7xl leading-none text-white uppercase`}>
              {headWords}
              {lastWord ? (
                <>
                  {" "}
                  <span style={{ color: accent }}>{lastWord}</span>
                </>
              ) : null}
            </h1>
            {subheadline ? (
              <p className="mt-6 font-montserrat text-2xl leading-snug text-gray-400">{subheadline}</p>
            ) : null}
          </div>

          <div className="relative w-[55%] shrink-0 overflow-hidden">
            {bg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="absolute inset-0 bg-zinc-300" />
            )}
          </div>
        </div>

        {/* Middle floor: white benefit strip, 4 centered icon bullets. */}
        <div className="grid w-full flex-1 grid-cols-4 items-center gap-4 bg-white px-4 py-6 text-black">
          {items.map((item, index) => {
            const Icon = BENEFIT_ICONS[index % BENEFIT_ICONS.length]!;
            return (
              <div key={item} className="flex flex-col items-center text-center font-montserrat">
                <Icon className="mb-3 size-8 shrink-0" strokeWidth={2.2} style={{ color: accent }} />
                <span className="text-base leading-tight text-black">{item}</span>
              </div>
            );
          })}
        </div>

        {/* Bottom floor: monolith accent footer — offer + black CTA. */}
        <footer
          className={`flex shrink-0 items-center gap-4 px-8 py-5 ${badgeLabel ? "justify-between" : "justify-end"} ${stories ? "pb-20" : ""}`}
          style={{ backgroundColor: accent }}
        >
          {badgeLabel ? (
            <div
              className={`flex min-w-0 items-center gap-3 text-left ${headlineFontClass(fontStyle)} text-3xl leading-none tracking-wide uppercase`}
              style={{ color: onAccent }}
            >
              <Calendar className="size-8 shrink-0" strokeWidth={2.5} />
              <span>{badgeLabel}</span>
            </div>
          ) : null}
          <div className="flex shrink-0 items-center gap-2 rounded-lg bg-black px-6 py-3 font-montserrat text-lg font-bold text-white uppercase">
            <span>{buttonText}</span>
            <ArrowRight className="size-6 shrink-0" strokeWidth={2.5} />
          </div>
        </footer>
      </article>
    </CreativeWrapper>
  );
}
