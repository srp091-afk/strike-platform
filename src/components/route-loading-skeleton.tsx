import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-[#111]", className)} />;
}

export function AdsRouteSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-3">
          <Block className="h-9 w-56" />
          <Block className="h-4 w-80 max-w-full" />
        </div>
        <Block className="h-10 w-40" />
      </div>
      <div className="mt-10 grid gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-6 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 sm:p-6 lg:flex-row lg:items-center"
          >
            <div className="min-w-0 flex-1 grid gap-3">
              <Block className="h-7 w-64 max-w-full" />
              <Block className="h-4 w-40" />
              <Block className="h-4 w-52" />
              <Block className="mt-2 h-10 w-36" />
            </div>
            <div className="flex gap-2">
              {Array.from({ length: 4 }, (_, thumb) => (
                <Block key={thumb} className="h-24 w-24 shrink-0" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AgentsRouteSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="grid gap-3">
        <Block className="h-3 w-24" />
        <Block className="h-9 w-40" />
        <Block className="h-4 w-96 max-w-full" />
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="grid gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Block key={index} className="h-11 w-full" />
          ))}
        </div>
        <div className="grid gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
          <Block className="h-10 w-full" />
          <Block className="h-10 w-48" />
          <Block className="h-64 w-full" />
        </div>
      </div>
    </div>
  );
}

export function SitesRouteSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-16">
      <div className="flex flex-col items-center gap-4 pt-10 text-center sm:pt-16">
        <Block className="h-3 w-20" />
        <Block className="h-14 w-[min(36rem,90%)]" />
        <Block className="h-4 w-[min(28rem,80%)]" />
        <Block className="mt-6 h-36 w-full max-w-3xl rounded-[28px]" />
      </div>
      <div className="mt-12 grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Block key={index} className="h-24 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function ChatsRouteSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <div className="grid gap-3">
        <Block className="h-3 w-24" />
        <Block className="h-9 w-32" />
        <Block className="h-4 w-80 max-w-full" />
      </div>
      <div className="mt-8 grid h-[42rem] gap-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/40 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="grid gap-2 border-r border-zinc-800 p-3">
          <Block className="h-10 w-full" />
          {Array.from({ length: 8 }, (_, index) => (
            <Block key={index} className="h-16 w-full" />
          ))}
        </div>
        <div className="grid content-start gap-3 p-6">
          <Block className="h-8 w-48" />
          <Block className="h-24 w-2/3" />
          <Block className="ml-auto h-16 w-1/2" />
          <Block className="h-20 w-3/5" />
        </div>
      </div>
    </div>
  );
}
