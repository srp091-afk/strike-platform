export function PageFrame({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">{description}</p> : null}
      </header>
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function IndexMark({ value }: { value: string }) {
  return (
    <span className="inline-grid h-8 min-w-8 place-items-center rounded-lg bg-zinc-800 px-2 font-heading text-sm font-semibold text-white">
      {value}
    </span>
  );
}
