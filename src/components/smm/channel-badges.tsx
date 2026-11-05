import { cn } from "@/lib/utils";
import { SMM_CHANNELS, type SmmChannelId } from "@/lib/smm-strategy-types";

const COLORS: Record<SmmChannelId, string> = {
  instagram: "border-pink-200 bg-pink-50 text-pink-600",
  facebook: "border-blue-200 bg-blue-50 text-blue-600",
  tiktok: "border-gray-200 bg-gray-50 text-[#0b0b0f]",
  threads: "border-gray-200 bg-gray-50 text-[#0b0b0f]",
  youtube: "border-red-200 bg-red-50 text-red-600",
};

function Glyph({ id, className }: { id: SmmChannelId; className?: string }) {
  switch (id) {
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.2" cy="6.8" r="0.8" fill="currentColor" />
        </svg>
      );
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
          <path d="M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-.95.46-1.88 1.95-1.88h1.5V3.7S15.6 3.5 14.3 3.5c-2.7 0-4.5 1.64-4.5 4.6v2.4H6.8v3.3h3V22h3.7Z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
          <path d="M16.6 3c.3 2.4 1.7 3.9 4 4.1v3.1c-1.4.1-2.7-.3-4-1.1v5.9c0 3.7-2.6 6-5.7 6-3.3 0-5.7-2.6-5.4-5.9.3-3.1 3-5.2 6.1-4.8v3.2c-1.5-.4-3 .4-3.2 1.9-.2 1.4.9 2.6 2.3 2.6 1.4 0 2.3-1 2.3-2.5V3h3.6Z" />
        </svg>
      );
    case "threads":
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
          <path d="M17.5 11.3c-.3-3-2.1-4.6-5.2-4.6-2.8 0-4.8 1.8-4.8 5.3 0 3.6 2 5.6 5 5.6 2.4 0 3.8-1.2 3.8-2.8 0-3-4.9-3.2-6.2-1.6-.8 1 0 2.2 1.6 2.2 2.6 0 3.2-2.7 3.2-4.4" />
          <path d="M12 21.3c-5.2 0-8.3-3-8.3-9.3S6.8 2.7 12 2.7s8.3 3 8.3 9.3" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
          <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
        </svg>
      );
  }
}

/** Ряд круглых иконок соцсетей (по порядку выбранных каналов). */
export function ChannelBadges({ channels, className }: { channels: SmmChannelId[]; className?: string }) {
  if (channels.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-1.5", className)} aria-label="Соцсети публикации">
      {channels.map((id) => (
        <li key={id} title={SMM_CHANNELS.find((channel) => channel.id === id)?.label ?? id} className={cn("grid size-8 place-items-center rounded-full border", COLORS[id])}>
          <Glyph id={id} className="size-4" />
          <span className="sr-only">{SMM_CHANNELS.find((channel) => channel.id === id)?.label}</span>
        </li>
      ))}
    </ul>
  );
}
