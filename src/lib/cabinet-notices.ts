export type CabinetNotice = {
  id: string;
  tone: "warning" | "info";
  title: string;
  detail: string;
  href: string;
};

export type ChannelAlert = {
  agentId: string;
  agentName: string;
  provider: "whatsapp" | "instagram" | "widget";
  state: "error" | "disconnected";
};

const LOW_BALANCE_SC = 100;
const SUBSCRIPTION_WINDOW_DAYS = 5;

const PROVIDER_LABEL = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  widget: "Виджет",
} as const;

export function collectCabinetNotices(input: {
  lowBalance: boolean;
  subscription: boolean;
  channelAlerts: boolean;
  timezone: string;
  credits: number;
  subscriptionStatus: string | null;
  subscriptionEndsAt: string | null;
  recentSubscriptionAt: string | null;
  channels: ChannelAlert[];
  now?: Date;
}): CabinetNotice[] {
  const now = input.now ?? new Date();
  const zone = input.timezone || "UTC";
  const notices: CabinetNotice[] = [];

  if (input.lowBalance && input.credits > 0 && input.credits < LOW_BALANCE_SC) {
    notices.push({
      id: "low-balance",
      tone: "warning",
      title: "Низкий баланс",
      detail: `На счёте ${Math.floor(input.credits)} SC. Пополните баланс, пока агенты ещё отвечают.`,
      href: "/billing",
    });
  }

  if (input.subscription) {
    const subscription = subscriptionNotice(input, zone, now);
    if (subscription) notices.push(subscription);
  }

  if (input.channelAlerts) {
    const channels = input.channels.slice(0, 5).map((channel) => channelNotice(channel));
    notices.push(...channels);
    const rest = input.channels.length - channels.length;
    if (rest > 0) {
      notices.push({
        id: "channels-more",
        tone: "warning",
        title: "Ещё каналы",
        detail: `Ещё ${rest} требуют внимания.`,
        href: "/agents",
      });
    }
  }

  return notices;
}

function subscriptionNotice(
  input: {
    subscriptionStatus: string | null;
    subscriptionEndsAt: string | null;
    recentSubscriptionAt: string | null;
  },
  zone: string,
  now: Date,
): CabinetNotice | null {
  const status = (input.subscriptionStatus ?? "").toLowerCase();
  const ends = formatWhen(input.subscriptionEndsAt, zone);
  const days = input.subscriptionEndsAt ? daysUntil(input.subscriptionEndsAt, zone, now) : null;
  const endingSoon = days != null && days >= 0 && days <= SUBSCRIPTION_WINDOW_DAYS;
  const expired = days != null && days < 0;

  if (status === "past_due") {
    return {
      id: "subscription-past-due",
      tone: "warning",
      title: "Оплата не прошла",
      detail: ends ? `Платёж не прошёл. Оплаченный период до ${ends}.` : "Платёж по подписке не прошёл.",
      href: "/billing",
    };
  }

  if (status === "canceled" || status === "cancelled") {
    return {
      id: "subscription-canceled",
      tone: "warning",
      title: "Подписка отменена",
      detail: ends ? `Доступ по текущему периоду до ${ends}.` : "Автопродление выключено.",
      href: "/billing",
    };
  }

  if (endingSoon || expired) {
    return {
      id: "subscription-ending",
      tone: "warning",
      title: expired ? "Подписка закончилась" : "Подписка скоро закончится",
      detail: ends ? `Дата в вашем часовом поясе: ${ends}.` : "Проверьте дату в биллинге.",
      href: "/billing",
    };
  }

  if (status === "active" && input.recentSubscriptionAt && (days == null || days > SUBSCRIPTION_WINDOW_DAYS)) {
    const paid = formatWhen(input.recentSubscriptionAt, zone);
    return {
      id: "subscription-active",
      tone: "info",
      title: "Подписка активна",
      detail: paid ? `Оплата прошла ${paid}. Продление или активация уже в кабинете.` : "Подписка активирована или продлена.",
      href: "/billing",
    };
  }

  return null;
}

function channelNotice(channel: ChannelAlert): CabinetNotice {
  const label = PROVIDER_LABEL[channel.provider];
  const broken = channel.state === "error";
  return {
    id: `channel-${channel.provider}-${channel.agentId}`,
    tone: "warning",
    title: broken ? `${label}: ошибка` : `${label} отключён`,
    detail: `Агент «${channel.agentName}». Откройте канал и подключите его снова.`,
    href: `/agents/${channel.agentId}`,
  };
}

function formatWhen(iso: string | null, zone: string) {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("ru-RU", { timeZone: zone, day: "numeric", month: "long", year: "numeric" }).format(date);
}

function daysUntil(iso: string, zone: string, now: Date) {
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  const start = calendarDay(now, zone);
  const end = calendarDay(target, zone);
  if (start == null || end == null) return null;
  return Math.round((end - start) / 86_400_000);
}

function calendarDay(date: Date, zone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    if (!year || !month || !day) return null;
    return Date.UTC(year, month - 1, day);
  } catch {
    return null;
  }
}
