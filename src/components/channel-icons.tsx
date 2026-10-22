import { Globe } from "lucide-react";
import type { SVGProps } from "react";

import type { IntegrationProvider } from "@/lib/integration-catalog";

const CHANNEL_ICONS: Record<IntegrationProvider, (props: SVGProps<SVGSVGElement>) => React.JSX.Element> = {
  telegram: TelegramIcon,
  whatsapp: WhatsAppIcon,
  instagram: InstagramIcon,
  widget: WidgetIcon,
};

export function ChannelIcon({
  provider,
  ...props
}: SVGProps<SVGSVGElement> & { provider: IntegrationProvider }) {
  const Icon = CHANNEL_ICONS[provider];
  return Icon ? <Icon {...props} /> : null;
}

function WidgetIcon(props: SVGProps<SVGSVGElement>) {
  return <Globe strokeWidth={1.75} aria-hidden {...props} />;
}

function TelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M21.94 4.3 18.7 19.7c-.25 1.08-.9 1.35-1.82.84l-5.02-3.7-2.42 2.33c-.27.27-.49.49-1 .49l.36-5.08 9.24-8.35c.4-.36-.09-.56-.62-.2L6.1 12.3 1.2 10.77c-1.06-.33-1.08-1.06.22-1.57L20.56 2.7c.88-.33 1.65.2 1.38 1.6Z" />
    </svg>
  );
}

function WhatsAppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2Zm5.76 14.15c-.24.68-1.4 1.3-1.93 1.38-.5.07-1.12.1-1.81-.11-.41-.13-.95-.31-1.64-.61-2.88-1.25-4.76-4.16-4.9-4.35-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.09 1-2.38.26-.28.57-.35.76-.35h.55c.17 0 .41-.07.64.49.24.58.82 2 .89 2.15.07.14.12.32.02.51-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.13-.28.28-.12.55.16.26.7 1.16 1.5 1.88 1.03.92 1.9 1.2 2.17 1.34.26.13.42.11.57-.07.16-.17.66-.77.84-1.03.17-.26.35-.22.58-.13.24.09 1.5.71 1.76.84.26.13.43.19.49.3.07.1.07.61-.17 1.29Z" />
    </svg>
  );
}

function InstagramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="3.25" y="3.25" width="17.5" height="17.5" rx="5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.4" cy="6.6" r="1" fill="currentColor" />
    </svg>
  );
}
