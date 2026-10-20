import { Check } from "lucide-react";

import { CreativeWrapper } from "@/components/creatives/CreativeWrapper";
import { DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import { headlineFontClass } from "@/lib/studio-styles";
import type { CreativeTemplateProps } from "@/types/creatives";

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
  const bg = images[0] ?? "";
  const items = (bullets.length > 0 ? bullets : ["Результат", "Система", "Контроль", "Масштаб"]).slice(0, 4);
  // Strict conditional badge: empty/whitespace hides the plate completely.
  const badgeLabel = badge?.trim() ?? "";
  const stories = format === "9:16";

  return (
    <CreativeWrapper format={format}>
      <article className="flex flex-col h-full w-full overflow-hidden bg-white text-black">
        <div className="flex flex-1 flex-row min-h-0">
          <div className="w-[45%] shrink-0 bg-black p-6 flex flex-col justify-center gap-4">
            <h1 className={`${headlineFontClass(fontStyle)} text-5xl leading-[0.95] text-white uppercase`}>{headline}</h1>
            {subheadline ? (
              <p className="font-montserrat text-lg leading-snug text-gray-400">{subheadline}</p>
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

        <div className="grid grid-cols-4 gap-2 p-4 text-center text-xs font-bold text-black bg-white">
          {items.map((item) => (
            <div key={item} className="flex flex-col items-center gap-2 font-montserrat leading-snug">
              <Check className="size-6 shrink-0" strokeWidth={3} style={{ color: accent }} />
              <span>{item}</span>
            </div>
          ))}
        </div>

        <footer
          className={`flex items-center gap-4 p-4 ${badgeLabel ? "justify-between" : "justify-center"} ${stories ? "pb-14" : ""}`}
          style={{ backgroundColor: accent }}
        >
          {badgeLabel ? (
            <p className="font-montserrat text-base font-bold tracking-wide text-white uppercase">{badgeLabel}</p>
          ) : null}
          <div className="shrink-0 bg-black text-white px-4 py-2 font-montserrat text-sm uppercase font-bold">
            {buttonText}
          </div>
        </footer>
      </article>
    </CreativeWrapper>
  );
}
