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
  format = "4:5",
}: CreativeTemplateProps) {
  const accent = resolveAccentHex(accentColor, DEFAULT_ACCENT_COLOR);
  const bg = images[0] ?? "";
  const items = (bullets.length > 0 ? bullets : ["Быстрый результат", "Прозрачная система"]).slice(0, 4);
  // Strict conditional badge: empty/whitespace hides the plate completely
  // (flex `gap-5` collapses with the absent element — no empty hole).
  const badgeLabel = badge?.trim() ?? "";
  const stories = format === "9:16";

  return (
    <CreativeWrapper format={format}>
      <article className="relative h-full w-full overflow-hidden bg-black text-white">
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-zinc-900" />
        )}
        {/* Gradient substrate rises above the text plate for a smooth blend. */}
        <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-black/95 via-black/70 to-transparent" />

        {/* Text plate: stable 40% of the creative height, anchored to the bottom.
            Stories (9:16) lifts content above the platform UI safe zone. */}
        <div
          className={`absolute inset-x-0 bottom-0 flex w-full flex-col justify-end gap-5 p-10 ${stories ? "h-[46%] pb-44" : "h-[40%]"}`}
        >
          {badgeLabel ? (
            <p
              className="flex items-center gap-2.5 font-montserrat text-base font-bold tracking-[0.14em] uppercase"
              style={{ color: accent }}
            >
              <Gift className="size-6 shrink-0" strokeWidth={2.5} />
              {badgeLabel}
            </p>
          ) : null}

          <h1 className="font-anton text-6xl leading-[0.95] tracking-tight text-white uppercase">
            {headline}
          </h1>

          {subheadline ? (
            <p className="font-montserrat text-2xl leading-relaxed text-gray-200">{subheadline}</p>
          ) : null}

          <ul className="flex flex-col gap-3">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-3 font-montserrat text-xl leading-relaxed text-white">
                <Check className="mt-1 size-6 shrink-0" strokeWidth={3} style={{ color: accent }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div
            className="w-full py-4 text-center font-montserrat text-xl font-bold uppercase text-white"
            style={{ backgroundColor: accent }}
          >
            {buttonText}
          </div>
        </div>
      </article>
    </CreativeWrapper>
  );
}
