import { CreativeWrapper } from "@/components/creatives/CreativeWrapper";
import { DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import type { CreativeTemplateProps } from "@/types/creatives";

export function Style4_SideFade({
  headline,
  subheadline,
  bullets,
  buttonText,
  images,
  accentColor,
}: CreativeTemplateProps) {
  const accent = resolveAccentHex(accentColor, DEFAULT_ACCENT_COLOR);
  const bg = images[0] ?? "";
  const items = (bullets.length > 0 ? bullets : ["Быстрый результат", "Прозрачная система"]).slice(0, 4);

  return (
    <CreativeWrapper>
      <article className="relative h-full w-full overflow-hidden bg-black text-white">
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-zinc-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent" />

        <div className="absolute inset-0 p-8 flex flex-col justify-end w-[75%] gap-5">
          <h1 className="text-5xl font-anton uppercase text-white leading-[1.1]">{headline}</h1>

          {subheadline ? (
            <p className="font-montserrat text-xl text-gray-300 border-l-4 pl-4" style={{ borderColor: accent }}>
              {subheadline}
            </p>
          ) : null}

          <ul className="list-disc pl-5 text-white space-y-2 font-montserrat text-base leading-snug">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>

          <div
            className="py-3 px-6 font-montserrat text-lg font-bold uppercase text-black w-fit"
            style={{ backgroundColor: accent }}
          >
            {buttonText}
          </div>
        </div>
      </article>
    </CreativeWrapper>
  );
}
