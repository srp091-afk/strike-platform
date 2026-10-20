/** Miniature style thumbnails for the wizard + refresh modal (styles 1–5). */
export function StudioStylePreview({ styleKey }: { styleKey: string }) {
  if (styleKey === "split-action") return <SplitActionPreview />;
  if (styleKey === "premium-dark") return <PremiumDarkPreview />;
  if (styleKey === "side-fade") return <SideFadePreview />;
  if (styleKey === "editorial-block") return <EditorialBlockPreview />;
  return <VsPreview />;
}

function VsPreview() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-black text-white">
      <div className="absolute inset-0 grid grid-cols-2">
        <div className="bg-zinc-800" />
        <div className="bg-zinc-600" />
      </div>
      <div className="absolute left-1/2 top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-rose-500 bg-black text-xs font-bold">
        VS
      </div>
      <p className="absolute bottom-4 left-4 text-[10px] tracking-widest text-zinc-400 uppercase">До</p>
      <p className="absolute right-4 bottom-4 text-[10px] tracking-widest text-zinc-200 uppercase">После</p>
    </div>
  );
}

function SplitActionPreview() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-black text-white">
      <div className="absolute inset-x-0 top-0 space-y-1 bg-black px-3 py-4 text-center">
        <p className="text-[9px] tracking-[0.2em] text-amber-300 uppercase">Акцент</p>
        <p className="text-sm font-semibold leading-none">Сплит + CTA</p>
      </div>
      <div className="absolute inset-x-0 top-[22%] bottom-[18%] grid grid-cols-2">
        <div className="bg-zinc-800" />
        <div className="bg-zinc-600" />
      </div>
      <div className="absolute inset-x-2 bottom-[18%] rounded bg-black/80 px-2 py-1.5 text-[8px] text-zinc-300">
        ✓ Буллит · ✓ Буллит
      </div>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-black px-3 py-3">
        <span className="rounded bg-amber-300 px-2 py-1 text-[8px] font-bold text-black">Бейдж</span>
        <span className="rounded bg-amber-300 px-3 py-1 text-[9px] font-bold text-black">CTA</span>
      </div>
    </div>
  );
}

function PremiumDarkPreview() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-zinc-800 text-white">
      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 space-y-2 p-3">
        <p className="text-[8px] font-bold tracking-[0.18em] text-amber-300 uppercase">🎁 Подарок</p>
        <p className="text-sm font-semibold leading-none">Premium Dark</p>
        <p className="text-[8px] text-zinc-300">✓ Буллит · ✓ Буллит</p>
        <span className="block rounded bg-amber-300 px-2 py-1.5 text-center text-[8px] font-bold text-white">
          CTA
        </span>
      </div>
    </div>
  );
}

function SideFadePreview() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-zinc-700 text-white">
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/80 to-transparent" />
      <div className="absolute inset-0 flex w-[75%] flex-col justify-end gap-2 p-3">
        <p className="text-sm font-semibold leading-none">Side Fade</p>
        <p className="border-l-2 border-amber-300 pl-2 text-[8px] text-zinc-300">Подзаголовок</p>
        <p className="text-[8px] text-zinc-200">• Буллит · • Буллит</p>
        <span className="w-fit rounded bg-amber-300 px-2 py-1 text-[8px] font-bold text-black">CTA</span>
      </div>
    </div>
  );
}

function EditorialBlockPreview() {
  return (
    <div className="relative flex aspect-[4/5] flex-col overflow-hidden bg-white text-black">
      <div className="flex flex-1">
        <div className="flex w-[45%] flex-col justify-center gap-1 bg-black p-3 text-white">
          <p className="text-xs font-semibold leading-none">Editorial</p>
          <p className="text-[8px] text-zinc-400">Подзаголовок</p>
        </div>
        <div className="w-[55%] bg-zinc-500" />
      </div>
      <p className="px-2 py-2 text-center text-[8px] font-bold">✓ Выгода · ✓ Выгода · ✓ Выгода · ✓ Выгода</p>
      <div className="flex items-center justify-between bg-amber-300 px-3 py-2">
        <span className="text-[8px] font-bold text-white uppercase">Бейдж</span>
        <span className="rounded bg-black px-2 py-1 text-[8px] font-bold text-white">CTA</span>
      </div>
    </div>
  );
}
