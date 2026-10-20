import { Check, Gift } from "lucide-react";

import { CreativeWrapper } from "@/components/creatives/CreativeWrapper";
import { DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import type { CreativeTemplateProps } from "@/types/creatives";

export function Style3_PremiumDark({
  headline,
  subheadline,
  bullets,
  badge,
  buttonText,
  images,
  accentColor,
}: CreativeTemplateProps) {
  const accent = resolveAccentHex(accentColor, DEFAULT_ACCENT_COLOR);
  const bg = images[0] ?? "";
  const items = (bullets.length > 0 ? bullets : ["Быстрый результат", "Прозрачная система"]).slice(0, 4);
  const badgeLabel = badge?.trim();

  return (
    <CreativeWrapper>
      <article className="relative h-full w-full overflow-hidden bg-black text-white">
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-zinc-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent" />

        <div className="absolute bottom-0 w-full p-6 flex flex-col gap-4">
          {badgeLabel ? (
            <p
              className="flex items-center gap-2 font-montserrat text-sm font-bold tracking-[0.14em] uppercase"
              style={{ color: accent }}
            >
              <Gift className="size-5 shrink-0" strokeWidth={2.5} />
              {badgeLabel}
            </p>
          ) : null}

          <h1 className="text-4xl font-anton uppercase text-white leading-tight">{headline}</h1>

          {subheadline ? <p className="font-montserrat text-lg text-gray-200">{subheadline}</p> : null}

          <ul className="flex flex-col gap-2">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-2 font-montserrat text-base leading-snug text-white">
                <Check className="mt-0.5 size-5 shrink-0" strokeWidth={3} style={{ color: accent }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div
            className="w-full py-4 text-center font-montserrat text-lg font-bold uppercase text-white"
            style={{ backgroundColor: accent }}
          >
            {buttonText}
          </div>
        </div>
      </article>
    </CreativeWrapper>
  );
}
