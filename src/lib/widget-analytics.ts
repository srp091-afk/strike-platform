/** Цели веб-виджета. Названия копируются в Метрику и GA4 как есть. */
export const WIDGET_ANALYTICS_GOALS = [
  { name: "strike_phone_submitted", hint: "Посетитель оставил номер телефона" },
  { name: "strike_voice_clicked", hint: "Нажал кнопку голосового ввода" },
  { name: "strike_chat_started", hint: "Отправил первое сообщение в чат" },
  { name: "strike_appointment_booked", hint: "Бот записал клиента на встречу или услугу" },
  { name: "strike_widget_open", hint: "Посетитель открыл виджет" },
  { name: "strike_handoff", hint: "Диалог переведён на оператора" },
] as const;

export type WidgetAnalyticsEvent = (typeof WIDGET_ANALYTICS_GOALS)[number]["name"];

const SESSION_EVENTS = new Set<WidgetAnalyticsEvent>(["strike_widget_open", "strike_chat_started", "strike_phone_submitted"]);

export type WidgetAnalyticsTarget = {
  agentId: string;
  ymCounterId: string | null;
  ga4MeasurementId: string | null;
  ga4Enabled: boolean;
};

export type WidgetAnalyticsMessage = {
  source: "strike-widget";
  type: "analytics_event";
  event: string;
  params: Record<string, unknown>;
  ymCounterId: string | null;
  ga4MeasurementId: string | null;
  ga4Enabled: boolean;
};

/** Пустая строка — поле очищено, null — значение некорректно. */
export function readYmCounterId(value: string): "" | string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^\d{1,20}$/.test(trimmed) ? trimmed : null;
}

/** Пустая строка — поле очищено, null — значение некорректно. */
export function readGa4MeasurementId(value: string): "" | string | null {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return "";
  return /^G-[A-Z0-9]{6,12}$/.test(trimmed) ? trimmed : null;
}

export function readPublicAnalytics(row: Record<string, unknown> | null | undefined) {
  const counter = readYmCounterId(typeof row?.ym_counter_id === "string" ? row.ym_counter_id : "");
  const measurement = readGa4MeasurementId(typeof row?.ga4_measurement_id === "string" ? row.ga4_measurement_id : "");
  return {
    ym_counter_id: counter || null,
    ga4_measurement_id: measurement || null,
    ga4_enabled: row?.ga4_enabled === true,
  };
}

export function isWidgetAnalyticsEvent(value: string): value is WidgetAnalyticsEvent {
  return WIDGET_ANALYTICS_GOALS.some((goal) => goal.name === value);
}

/** Номер из 9–15 цифр, с пробелами, скобками и дефисами. */
export function messageHasPhone(text: string) {
  const matches = text.match(/\d[\d\s().+-]{7,22}\d/g);
  if (!matches) return false;
  return matches.some((chunk) => {
    const digits = chunk.replace(/\D/g, "");
    return digits.length >= 9 && digits.length <= 15;
  });
}

/**
 * Цель виджета. Сессионные события не повторяются.
 * Голосовая кнопка, когда появится: trackWidgetEvent("strike_voice_clicked").
 */
export function trackWidgetEvent(target: WidgetAnalyticsTarget, eventName: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  try {
    if (isWidgetAnalyticsEvent(eventName) && SESSION_EVENTS.has(eventName)) {
      const key = `strike-analytics:${target.agentId}:${eventName}`;
      if (window.sessionStorage.getItem(key) === "1") return;
      window.sessionStorage.setItem(key, "1");
    }
  } catch {
    // Приватный режим может запретить sessionStorage: событие всё равно уходит один раз.
  }

  const message: WidgetAnalyticsMessage = {
    source: "strike-widget",
    type: "analytics_event",
    event: eventName,
    params,
    ymCounterId: target.ymCounterId,
    ga4MeasurementId: target.ga4MeasurementId,
    ga4Enabled: target.ga4Enabled,
  };

  try {
    if (window.parent !== window) {
      window.parent.postMessage(message, "*");
      return;
    }
  } catch {
    // Родитель недоступен: отправляем со своей страницы.
  }
  sendWidgetAnalytics(message);
}

type AnalyticsHost = Window & {
  ym?: (counterId: number, method: "reachGoal", goal: string, params?: Record<string, unknown>) => void;
  gtag?: (command: "event", eventName: string, params?: Record<string, unknown>) => void;
  dataLayer?: Array<Record<string, unknown>>;
};

/** Вызов счётчиков на странице, где уже есть ym / gtag / dataLayer. Ошибки счётчиков глотаются. */
export function sendWidgetAnalytics(message: {
  event?: unknown;
  params?: unknown;
  ymCounterId?: unknown;
  ga4MeasurementId?: unknown;
  ga4Enabled?: unknown;
}) {
  try {
    const event = typeof message.event === "string" ? message.event : "";
    if (!event) return;
    const params =
      message.params && typeof message.params === "object" && !Array.isArray(message.params)
        ? (message.params as Record<string, unknown>)
        : {};
    const ymCounterId = typeof message.ymCounterId === "string" ? message.ymCounterId : "";
    const ga4MeasurementId = typeof message.ga4MeasurementId === "string" ? message.ga4MeasurementId : "";
    const ga4Enabled = message.ga4Enabled === true;
    const host = window as AnalyticsHost;
    if (ymCounterId && typeof host.ym === "function") {
      host.ym(Number(ymCounterId), "reachGoal", event, params);
    }
    if (ga4Enabled || ga4MeasurementId) {
      if (typeof host.gtag === "function") {
        host.gtag("event", event, ga4MeasurementId ? { ...params, send_to: ga4MeasurementId } : params);
      }
      if (Array.isArray(host.dataLayer)) {
        host.dataLayer.push({ event, ...params });
      }
    }
  } catch {
    // На сайте клиента может не быть счётчиков.
  }
}
