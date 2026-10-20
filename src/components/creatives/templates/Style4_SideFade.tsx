import { CreativeWrapper } from "@/components/creatives/CreativeWrapper";
import { DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import { headlineFontClass } from "@/lib/studio-styles";
import type { CreativeTemplateProps } from "@/types/creatives";

export function Style4_SideFade({
  headline,
  subheadline,
  bullets,
  buttonText,
  images,
  accentColor,
  fontStyle,
  region,
  format = "4:5",
}: CreativeTemplateProps) {
  const accent = resolveAccentHex(accentColor, DEFAULT_ACCENT_COLOR);
  const bg = images[0] ?? "";
  const items = (bullets.length > 0 ? bullets : ["Быстрый результат", "Прозрачная система"]).slice(0, 4);
  const regionLabel = region?.trim() ?? "";
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
        {/* Side gradient: solid black on the left, transparent on the right. */}
        <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/70 to-transparent" />

        {/* Text block is hard-capped at ~60% width and pinned to the left;
            the photo's right half stays clean. */}
        <div className={`absolute inset-y-0 left-0 flex w-[62%] max-w-[65%] flex-col p-8 ${stories ? "pb-28" : ""}`}>
          <div className="flex flex-1 flex-col justify-center">
            <h1 className={`${headlineFontClass(fontStyle)} text-6xl leading-[0.95] text-white uppercase`}>
              {headline}
            </h1>

            <div className="my-4 h-[2px] w-full bg-white" />

            {subheadline ? (
              <p className="font-montserrat text-xl leading-snug text-white">{subheadline}</p>
            ) : null}

            <ul className="mt-6 flex flex-col gap-2">
              {items.map((item) => (
                <li key={item} className="flex items-center gap-3 font-montserrat text-lg leading-snug text-white">
                  <span className="size-1.5 shrink-0 rounded-full bg-white" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-auto shrink-0">
            {regionLabel ? (
              <p className="mb-3 font-montserrat text-xs font-semibold tracking-[0.25em] text-white/80 uppercase">
                {regionLabel}
              </p>
            ) : null}
            <div
              className="w-fit rounded-md px-6 py-4 font-montserrat text-lg font-bold text-black uppercase"
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
