import { ShieldCheck } from "lucide-react";

import { CreativeWrapper } from "@/components/creatives/CreativeWrapper";
import { DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import { headlineFontClass } from "@/lib/studio-styles";
import type { CreativeTemplateProps } from "@/types/creatives";

/** Contrast text color for an accent plate: dark on bright accents, white on dark ones. */
function accentTextColor(hex: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return "#000000";
  const value = parseInt(match[1]!, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#000000" : "#ffffff";
}

export function Style3_PremiumDark({
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
  const items = (bullets.length > 0 ? bullets : ["Быстрый результат", "Прозрачная система"]).slice(0, 4);
  // Strict conditional badge: empty/whitespace hides the plate completely.
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

        {/* Gradient overlay carrying all content in the lower part. */}
        <div className="absolute inset-x-0 bottom-0 h-[82%] bg-gradient-to-t from-black via-black/80 to-transparent" />

        {/* Left-aligned content column inside the overlay.
            Stories (9:16) lifts content above the platform UI safe zone. */}
        <div
          className={`absolute inset-x-0 bottom-0 flex w-full flex-col items-start px-10 pb-10 text-left ${stories ? "pb-44" : ""}`}
        >
          {badgeLabel ? (
            <p
              className="inline-flex rounded-md px-3 py-1 font-montserrat text-sm font-bold uppercase"
              style={{ backgroundColor: accent, color: onAccent }}
            >
              {badgeLabel}
            </p>
          ) : null}

          <h1
            className={`${badgeLabel ? "mt-5" : ""} ${headlineFontClass(fontStyle)} text-6xl leading-[0.95] tracking-tight text-white uppercase`}
          >
            {headline}
          </h1>

          {subheadline ? (
            <p className="mt-4 font-montserrat text-xl leading-relaxed text-white/90">{subheadline}</p>
          ) : null}

          <ul className="mt-6 flex flex-col gap-3">
            {items.map((item) => (
              <li key={item} className="flex items-start gap-3 font-montserrat text-xl leading-snug text-white">
                <ShieldCheck className="mt-0.5 size-6 shrink-0" strokeWidth={2.5} style={{ color: accent }} />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <div
            className="mt-8 w-fit rounded-xl px-6 py-4 font-montserrat text-xl font-bold uppercase"
            style={{ backgroundColor: accent, color: onAccent }}
          >
            {buttonText}
          </div>
        </div>
      </article>
    </CreativeWrapper>
  );
}
