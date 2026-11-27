import { disabledResult, type ResultPreview } from "@/lib/sites/quiz-schema";

export type ResultPresetId = "real_estate_yield" | "marketing_forecast" | "renovation_estimate" | "property_match" | "business_audit";

export const RESULT_PRESETS: Array<{ id: ResultPresetId; label: string; hint: string }> = [
  { id: "real_estate_yield", label: "Доходность недвижимости", hint: "Вход, % годовых и три сценария суммы" },
  { id: "marketing_forecast", label: "Прогноз трафика", hint: "Лиды, CPL и выручка по бюджету" },
  { id: "renovation_estimate", label: "Смета ремонта", hint: "Стоимость, срок и этапы работ" },
  { id: "property_match", label: "Подборка объектов", hint: "Один вариант открыт, остальные в WhatsApp" },
  { id: "business_audit", label: "Аудит потенциала", hint: "Индекс, эффект и план действий" },
];

function base(partial: Partial<ResultPreview> & Pick<ResultPreview, "template">): ResultPreview {
  return { ...disabledResult(), enabled: true, ...partial };
}

export function resultPreset(id: ResultPresetId, symbol = "$"): ResultPreview {
  if (id === "marketing_forecast") return marketing(symbol);
  if (id === "renovation_estimate") return renovation(symbol);
  if (id === "property_match") return property(symbol);
  if (id === "business_audit") return audit();
  return realEstate(symbol);
}

export function templateFromHint(hint: string): ResultPreview["template"] {
  const text = hint.toLowerCase();
  if (/ремонт|стройк|строител|клиник|стоматолог|смет/.test(text)) return "estimate_breakdown";
  if (/аудит|консалт|внедрен/.test(text)) return "diagnostic_audit";
  if (/подбор|автомоб|\bавто\b|вилл|машин/.test(text)) return "curated_match";
  return "financial_forecast";
}

export function presetForTemplate(template: ResultPreview["template"], hint = ""): ResultPreview {
  const text = hint.toLowerCase();
  const symbol = /₸|тенге|казах|алматы|астан/.test(text) ? "₸" : /€|евро/.test(text) ? "€" : /₽|руб|млн|тыс/.test(text) && !/\$|usd|бали|дуба/.test(text) ? "₽" : "$";
  if (template === "estimate_breakdown") return renovation(symbol);
  if (template === "curated_match") return property(symbol);
  if (template === "diagnostic_audit") return audit();
  if (/маркетинг|трафик|лид|реклам|cpl|roas/.test(text)) return marketing(symbol);
  return realEstate(symbol);
}

/** Чистый каркас без чужой ниши. Формулы ссылаются только на переменную текущего квиза. */
export function neutralForTemplate(template: ResultPreview["template"], variableKey: string, currency: ResultPreview["currency"]): ResultPreview {
  const key = /^[a-z][a-z0-9_]{0,31}$/.test(variableKey) ? variableKey : "budget";
  const sample = /area|score|count/.test(key) ? 60 : 1_500_000;
  const shared = {
    currency,
    eyebrow: "Ваш результат",
    footnote: "Предварительный расчёт. Точные условия зафиксируем после заявки.",
    lockBadgeText: "Полный расчёт — после заявки",
    rules: [],
    sampleDefaults: { [key]: sample, match_count: 6 },
  };
  if (template === "estimate_breakdown") {
    return base({
      ...shared,
      template,
      defaultHeadline: "Ориентир по вашим ответам",
      defaultDescription: "Основной блок уже виден. Остальные части откроются после заявки.",
      kpis: [
        { id: "total", valueExpr: `=${key}`, label: "Ориентир", format: "currency", accent: true },
        { id: "share", valueExpr: `=round(${key} * 0.2)`, label: "Дополнительно", format: "currency" },
      ],
      table: {
        columns: [
          { key: "stage", label: "Блок", format: "text", align: "left" },
          { key: "sum", label: "Сумма", format: "currency", align: "right" },
        ],
        rows: [
          { id: "main", cells: { stage: "Основной блок", sum: `=${key}` }, locked: false },
          { id: "extra", cells: { stage: "Дополнительно", sum: `=${key} * 0.35` }, locked: true },
          { id: "reserve", cells: { stage: "Резерв", sum: `=${key} * 0.15` }, locked: true },
        ],
      },
      matches: null,
      audit: null,
    });
  }
  if (template === "curated_match") {
    return base({
      ...shared,
      template,
      defaultHeadline: "Подборка под ваш запрос",
      defaultDescription: "Первый вариант уже совпал с ответами. Остальные откроем после заявки.",
      kpis: [],
      table: null,
      matches: {
        badgeText: "Подобрано {{match_count}} вариантов",
        items: [
          { id: "a", title: "Вариант в вашем диапазоне", subtitle: "Параметры под ваш запрос", priceExpr: `=${key}`, metricText: "ближе всего", locked: false },
          { id: "b", title: "Вариант с запасом", subtitle: "Чуть шире по параметрам", priceExpr: `=${key} * 1.12`, metricText: "запас", locked: true },
          { id: "c", title: "Вариант максимальной комплектации", subtitle: "Верхняя граница подбора", priceExpr: `=${key} * 1.28`, metricText: "максимум", locked: true },
        ],
      },
      audit: null,
    });
  }
  if (template === "diagnostic_audit") {
    return base({
      ...shared,
      template,
      currency: { symbol: "%", position: "after", decimals: 0 },
      defaultHeadline: "Индекс уже посчитан",
      defaultDescription: "Один вывод открыт. Остальной план отправим после заявки.",
      kpis: [],
      table: null,
      matches: null,
      audit: {
        scoreExpr: "72",
        scoreLabel: "Индекс совпадения",
        impactExpr: "Следующий шаг откроется после заявки",
        insights: [
          { id: "open", title: "Что уже видно", detail: "Первый вывод по вашим ответам.", locked: false },
          { id: "next", title: "Что сделать дальше", detail: "Короткий следующий шаг.", locked: true },
          { id: "plan", title: "Как усилить результат", detail: "План после заявки.", locked: true },
        ],
      },
    });
  }
  return base({
    ...shared,
    template: "financial_forecast",
    defaultHeadline: `Ориентир по {{${key}}}`,
    defaultDescription: "Базовый сценарий уже посчитан. Остальные откроем после заявки.",
    kpis: [
      { id: "base", valueExpr: `=${key}`, label: "База", format: "currency", accent: true },
      { id: "mid", valueExpr: `=round(${key} * 1.2)`, label: "Усиленный", format: "currency" },
      { id: "top", valueExpr: `=round(${key} * 1.5)`, label: "Максимум", format: "currency" },
    ],
    table: {
      columns: [
        { key: "name", label: "Сценарий", format: "text", align: "left" },
        { key: "amount", label: "Сумма", format: "currency", align: "right" },
      ],
      rows: [
        { id: "base", cells: { name: "Базовый", amount: `=${key}` }, locked: false },
        { id: "mid", cells: { name: "Усиленный", amount: `=${key} * 1.2` }, locked: true },
        { id: "max", cells: { name: "Максимум", amount: `=${key} * 1.5` }, locked: true },
      ],
    },
    matches: null,
    audit: null,
  });
}

function money(symbol: string): ResultPreview["currency"] {
  return { symbol, position: symbol === "₸" || symbol === "₽" ? "after" : "before", decimals: 0 };
}

function realEstate(symbol: string): ResultPreview {
  return base({
    template: "financial_forecast",
    currency: money(symbol),
    eyebrow: "Ваш результат",
    defaultHeadline: "Доходность по бюджету {{budget}}",
    defaultDescription: "Первый сценарий уже посчитан по вашим ответам. Два усиленных сценария откроем в мессенджере.",
    sampleDefaults: { budget: 6_000_000, rate: 12 },
    rules: [
      {
        id: "yield-high",
        variable: "budget",
        operator: "gte",
        value: 8_000_000,
        headline: "Программа «Доход в квадрате»",
        description: "Для этого бюджета ставка выше: считаем усиленный сценарий.",
        overrideVariables: { rate: 25.2 },
      },
    ],
    kpis: [
      { id: "entry", valueExpr: "=budget", label: "Минимальный вход", format: "currency", accent: true },
      { id: "rate", valueExpr: "=rate", label: "Доходность в год", format: "percent" },
      { id: "payback", valueExpr: "=round(100 / max(rate, 1))", label: "Окупаемость, лет", format: "number" },
    ],
    table: {
      columns: [
        { key: "name", label: "Сценарий", format: "text", align: "left" },
        { key: "amount", label: "Сумма", format: "currency", align: "right" },
        { key: "month", label: "В месяц", format: "currency", align: "right" },
        { key: "year", label: "В год", format: "currency", align: "right" },
      ],
      rows: [
        { id: "base", cells: { name: "Базовый", amount: "=budget", month: "=budget * rate / 100 / 12", year: "=budget * rate / 100" }, locked: false },
        { id: "mid", cells: { name: "Усиленный", amount: "=budget * 1.5", month: "=budget * 1.5 * rate / 100 / 12", year: "=budget * 1.5 * rate / 100" }, locked: true },
        { id: "max", cells: { name: "Максимум", amount: "=budget * 2.5", month: "=budget * 2.5 * rate / 100 / 12", year: "=budget * 2.5 * rate / 100" }, locked: true },
      ],
    },
    matches: null,
    audit: null,
    lockBadgeText: "Полный расчёт — в WhatsApp",
    footnote: "Предварительный расчёт. Точные условия зафиксируем в мессенджере.",
  });
}

function marketing(symbol: string): ResultPreview {
  return base({
    template: "financial_forecast",
    currency: money(symbol),
    defaultHeadline: "Прогноз заявок при бюджете {{ad_spend}}",
    defaultDescription: "Базовый сценарий открыт. Оптимум и масштаб отправим вместе с медиапланом.",
    sampleDefaults: { ad_spend: 300_000, cpl: 15, aov: 45 },
    rules: [
      {
        id: "scale",
        variable: "ad_spend",
        operator: "gte",
        value: 700_000,
        headline: "Масштабирование с запасом по CPL",
        description: "На этом бюджете закладываем более низкую стоимость заявки.",
        overrideVariables: { cpl: 11 },
      },
    ],
    kpis: [
      { id: "leads", valueExpr: "=round(ad_spend / max(cpl, 1))", label: "Лиды в месяц", format: "number", accent: true },
      { id: "cpl", valueExpr: "=cpl", label: "Ориентир CPL", format: "currency" },
      { id: "roas", valueExpr: "=round(aov / max(cpl, 1) * 10) / 10", label: "ROAS", format: "number" },
    ],
    table: {
      columns: [
        { key: "name", label: "Сценарий", format: "text" },
        { key: "budget", label: "Бюджет", format: "currency", align: "right" },
        { key: "leads", label: "Лиды / мес", format: "number", align: "right" },
        { key: "revenue", label: "Прогноз выручки", format: "currency", align: "right" },
      ],
      rows: [
        { id: "base", cells: { name: "Базовый", budget: "=ad_spend", leads: "=round(ad_spend / max(cpl, 1))", revenue: "=round(ad_spend / max(cpl, 1)) * aov" }, locked: false },
        { id: "opt", cells: { name: "Оптимум", budget: "=ad_spend * 1.4", leads: "=round(ad_spend * 1.4 / max(cpl, 1))", revenue: "=round(ad_spend * 1.4 / max(cpl, 1)) * aov" }, locked: true },
        { id: "scale", cells: { name: "Масштаб", budget: "=ad_spend * 2", leads: "=round(ad_spend * 2 / max(cpl, 1))", revenue: "=round(ad_spend * 2 / max(cpl, 1)) * aov" }, locked: true },
      ],
    },
    matches: null,
    audit: null,
    lockBadgeText: "Полный расчёт — в WhatsApp",
  });
}

function renovation(symbol: string): ResultPreview {
  return base({
    template: "estimate_breakdown",
    currency: money(symbol),
    defaultHeadline: "Ориентир сметы для {{area}} м²",
    defaultDescription: "Черновые работы уже видны. Остальные этапы и персональная скидка — в PDF.",
    sampleDefaults: { area: 60, rate_m2: 450 },
    rules: [
      {
        id: "large",
        variable: "area",
        operator: "gte",
        value: 90,
        headline: "Смета для большой площади",
        description: "На объёме ставка за метр ниже.",
        overrideVariables: { rate_m2: 390 },
      },
    ],
    kpis: [
      { id: "cost", valueExpr: "=area * rate_m2", label: "Ориентир стоимости", format: "currency", accent: true },
      { id: "time", valueExpr: "=ceil(area / 20)", label: "Срок, месяцев", format: "number" },
      { id: "warranty", valueExpr: "3", label: "Гарантия, лет", format: "number" },
    ],
    table: {
      columns: [
        { key: "stage", label: "Этап", format: "text" },
        { key: "sum", label: "Сумма", format: "currency", align: "right" },
      ],
      rows: [
        { id: "rough", cells: { stage: "Черновые работы", sum: "=area * 120" }, locked: false },
        { id: "finish", cells: { stage: "Чистовая отделка", sum: "=area * 180" }, locked: true },
        { id: "eng", cells: { stage: "Инженерия", sum: "=area * 90" }, locked: true },
        { id: "discount", cells: { stage: "Персональная скидка", sum: "=area * rate_m2 * 0.08" }, locked: true },
      ],
    },
    matches: null,
    audit: null,
    lockBadgeText: "Подробная смета в PDF — в WhatsApp",
  });
}

function property(symbol: string): ResultPreview {
  return base({
    template: "curated_match",
    currency: money(symbol),
    defaultHeadline: "Подборка под ваш бюджет",
    defaultDescription: "Первый объект уже совпал с ответами. Остальные откроем в переписке.",
    sampleDefaults: { budget: 6_000_000, match_count: 6 },
    kpis: [],
    table: null,
    matches: {
      badgeText: "Подобрано {{match_count}} вариантов",
      items: [
        { id: "a", title: "Объект в вашем бюджете", subtitle: "2 спальни · вид на район", priceExpr: "=budget", metricText: "под ваш запрос", locked: false },
        { id: "b", title: "Вариант с более высокой доходностью", subtitle: "1 спальня · ближе к морю", priceExpr: "=budget * 1.15", metricText: "доходность выше", locked: true },
        { id: "c", title: "Вариант с запасом по площади", subtitle: "3 спальни · тихий комплекс", priceExpr: "=budget * 1.35", metricText: "больше площадь", locked: true },
      ],
    },
    audit: null,
    lockBadgeText: "Открыть все варианты в WhatsApp",
  });
}

function audit(): ResultPreview {
  return base({
    template: "diagnostic_audit",
    currency: { symbol: "%", position: "after", decimals: 0 },
    defaultHeadline: "Индекс потенциала уже посчитан",
    defaultDescription: "Один вывод уже открыт. Полный план действий отправим после заявки.",
    sampleDefaults: { score: 72, lift: 38 },
    kpis: [],
    table: null,
    matches: null,
    audit: {
      scoreExpr: "=score",
      scoreLabel: "Индекс потенциала",
      impactExpr: "+{{lift}}% к заявкам",
      insights: [
        { id: "open", title: "Где теряются заявки", detail: "Первый разрыв уже виден по вашим ответам.", locked: false },
        { id: "plan-1", title: "Шаг 1. Быстрый канал", detail: "Что включить на этой неделе.", locked: true },
        { id: "plan-2", title: "Шаг 2. Скрипт и оффер", detail: "Как поднять конверсию диалога.", locked: true },
        { id: "plan-3", title: "Шаг 3. Масштаб", detail: "Куда добавить бюджет без просадки CPL.", locked: true },
      ],
    },
    lockBadgeText: "Получить полный разбор",
  });
}
