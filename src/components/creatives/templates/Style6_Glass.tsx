import { Check, Flame } from "lucide-react";

import { CreativeWrapper } from "@/components/creatives/CreativeWrapper";
import { DEFAULT_ACCENT_COLOR, resolveAccentHex, withAccentAlpha } from "@/lib/accent-color";
import type { CreativeTemplateProps } from "@/types/creatives";

export function Style6_Glass({
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
  const items = (bullets.length > 0 ? bullets : ["Премиальный результат", "Быстрый запуск", "Контроль метрик"]).slice(
    0,
    5,
  );

  return (
    <CreativeWrapper>
      <article className="relative h-full w-full overflow-hidden bg-black text-white">
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-zinc-900" />
        )}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 50% 35%, rgba(0,0,0,0.35), rgba(0,0,0,0.82) 70%), rgba(0,0,0,0.4)",
          }}
        />

        <div className="relative z-10 flex h-full flex-col px-12 pb-12 pt-14">
          <header className="text-center">
            {badge ? (
              <span
                className="inline-flex items-center gap-2 rounded-full border px-5 py-2 font-montserrat text-base font-semibold tracking-wide"
                style={{
                  borderColor: withAccentAlpha(accent, 0.6),
                  backgroundColor: withAccentAlpha(accent, 0.2),
                  color: accent,
                }}
              >
                <Flame className="size-5" strokeWidth={2.5} style={{ color: accent }} />
                {badge}
              </span>
            ) : null}
            <h1 className="mt-8 font-anton text-7xl leading-[0.95] tracking-wide text-white uppercase">
              {headline}
            </h1>
            {subheadline ? (
              <p className="mx-auto mt-4 max-w-[880px] font-montserrat text-2xl font-medium leading-snug text-zinc-200">
                {subheadline}
              </p>
            ) : null}
          </header>

          <div className="mt-auto flex flex-col gap-8">
            <div
              className="rounded-2xl border bg-black/70 p-8 backdrop-blur-md"
              style={{ borderColor: withAccentAlpha(accent, 0.3) }}
            >
              <ul className="space-y-5">
                {items.map((item) => (
                  <li key={item} className="flex items-start gap-4 font-montserrat text-2xl leading-snug text-white">
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

            <div
              className="flex h-24 items-center justify-center rounded-2xl font-montserrat text-3xl font-bold tracking-wide text-black uppercase shadow-lg"
              style={{ backgroundColor: accent }}
            >
              {buttonText}
            </div>
          </div>
        </div>
      </article>
    </CreativeWrapper>
  );
}
