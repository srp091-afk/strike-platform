export const fieldClass =
  "h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white";

export const cardClass = "space-y-5 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-sm";

export function SettingsStatus({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) {
    return (
      <p className="text-sm text-red-300">
        <span>{error}</span>
      </p>
    );
  }
  if (notice) {
    return (
      <p className="text-sm text-emerald-300">
        <span>{notice}</span>
      </p>
    );
  }
  return null;
}
