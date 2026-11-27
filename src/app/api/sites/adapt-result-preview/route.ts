import { connection } from "next/server";

import { deniedStatus, getEffectiveUserId } from "@/lib/account-context";
import { getOpenAI } from "@/lib/openai";
import { evaluateExpr, previewFormulasOk } from "@/lib/sites/quiz-calculator";
import { detectCurrency } from "@/lib/sites/currency";
import { blankQuiz, parseQuizSchema, type QuizSchema, type ResultPreview, type ResultTemplate } from "@/lib/sites/quiz-schema";
import { getOwnedSite } from "@/lib/sites/store";

export const maxDuration = 60;

const TEMPLATES = new Set<ResultTemplate>(["financial_forecast", "estimate_breakdown", "curated_match", "diagnostic_audit"]);

export async function POST(request: Request) {
  await connection();
  try {
    await getEffectiveUserId();
    const body = (await request.json()) as {
      siteId?: string;
      template?: string;
      title?: string;
      nicheContext?: string;
      questions?: Array<{ title?: string; variableKey?: string; options?: Array<{ label?: string; numericValue?: number }> }>;
      currency?: { symbol?: string; position?: string; decimals?: number };
    };
    const siteId = body.siteId?.trim() ?? "";
    const template: ResultTemplate = TEMPLATES.has(body.template as ResultTemplate) ? (body.template as ResultTemplate) : "curated_match";
    const site = await getOwnedSite(siteId);
    if (!site || site.siteType !== "quiz") return Response.json({ error: "Квиз не найден." }, { status: 404 });
    const title = (body.title?.trim() || site.title).slice(0, 160);
    const nicheContext = (body.nicheContext?.trim() || title).slice(0, 800);
    const questions = Array.isArray(body.questions) ? body.questions.slice(0, 12) : [];
    const keys = questions.map((item) => (item.variableKey ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "")).filter(Boolean);
    const key = keys[0] || "budget";
    const source = `${title}\n${nicheContext}\n${questions.map((item) => `${item.title ?? ""} ${(item.options ?? []).map((option) => option.label ?? "").join(" ")}`).join("\n")}`;
    const detected = detectCurrency(source);
    const currency = {
      symbol: detected.symbol,
      position: detected.position,
      decimals: 0,
    };
    const frame = fallbackFrame(template, key, currency);
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: [
            "Заполни превью результата квиза строго под его нишу. Язык русский, коротко, без чужих отраслей.",
            "Если ниша про авто: лоты, год, пробег, кузов, доставка. Если про ремонт: этапы сметы. Если про клинику: план лечения. Если про жильё: комнаты и район.",
            "Запрещено писать про спальни, район и море в авто-квизе. Запрещено писать про метры и черновые работы, если ниша не про ремонт.",
            "Формулы начинаются с = и используют только переданные variableKey, числа, + - * / () и round floor ceil min max.",
            `Шаблон: ${template}. Первая строка или карточка locked false, остальные locked true.`,
            "Верни JSON: eyebrow, defaultHeadline, defaultDescription, footnote, lockBadgeText, loaderSteps (3 коротких статуса), kpis[{valueExpr,label,format}], table{columns[{key,label,format,align}], rows[{cells,locked}]}, matches{badgeText, items[{title,subtitle,priceExpr,metricText,locked}]}, audit{scoreExpr,scoreLabel,impactExpr,insights[{title,detail,locked}]}.",
            "Для curated_match badgeText обязан быть «Подобрано {{match_count}} вариантов», subtitle у каждой карточки — параметры этой ниши, не пустой.",
            "Неиспользуемые для шаблона блоки верни null.",
          ].join("\n"),
        },
        { role: "user", content: JSON.stringify({ title, nicheContext, template, variableKeys: keys.length ? keys : [key], questions, currency }) },
      ],
      response_format: { type: "json_object" },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return Response.json({ error: "Модель ничего не вернула." }, { status: 502 });
    const generated = JSON.parse(raw) as Record<string, unknown>;
    const preview = sanitizePreview(mergePreview(frame, generated, template, currency), source, key);
    return Response.json({ resultPreview: preview });
  } catch (error) {
    console.error("adapt-result-preview", error);
    const message = error instanceof Error && error.message.includes("Нужно войти") ? "Нужно войти." : error instanceof Error ? error.message : "Не удалось адаптировать превью.";
    return Response.json({ error: message }, { status: deniedStatus(error, message === "Нужно войти." ? 401 : 500) });
  }
}

function fallbackFrame(template: ResultTemplate, variableKey: string, currency: ResultPreview["currency"]): ResultPreview {
  const key = /^[a-z][a-z0-9_]{0,31}$/.test(variableKey) ? variableKey : "budget";
  const base = blankQuiz("Квиз").resultPreview;
  return {
    ...base,
    enabled: true,
    template,
    currency,
    eyebrow: "Ваш результат",
    defaultHeadline: template === "curated_match" ? "Подборка под ваш запрос" : "Ориентир по вашим ответам",
    defaultDescription: "Первый блок уже виден. Остальное откроется после заявки.",
    footnote: "Предварительный расчёт. Точные условия зафиксируем после заявки.",
    lockBadgeText: "Полный расчёт — после заявки",
    sampleDefaults: { [key]: 1_500_000, match_count: 6 },
    kpis: template === "curated_match" || template === "diagnostic_audit" ? [] : [{ id: "base", valueExpr: `=${key}`, label: "Ориентир", format: "currency", accent: true }],
    table: template === "financial_forecast" || template === "estimate_breakdown"
      ? {
          columns: [{ key: "name", label: "Блок", format: "text", align: "left" }, { key: "sum", label: "Сумма", format: "currency", align: "right" }],
          rows: [{ id: "main", cells: { name: "Основной", sum: `=${key}` }, locked: false }],
        }
      : null,
    matches: template === "curated_match"
      ? {
          badgeText: "Подобрано {{match_count}} вариантов",
          items: [
            { id: "a", title: "Вариант 1", subtitle: "Параметры под ваш запрос", priceExpr: `=${key}`, metricText: "", imageUrl: null, locked: false },
            { id: "b", title: "Вариант 2", subtitle: "Запас по параметрам", priceExpr: `=${key} * 1.12`, metricText: "", imageUrl: null, locked: true },
          ],
        }
      : null,
    audit: template === "diagnostic_audit"
      ? { scoreExpr: "72", scoreLabel: "Индекс", impactExpr: "Следующий шаг после заявки", insights: [{ id: "open", title: "Что уже видно", detail: "Первый вывод.", locked: false }] }
      : null,
  };
}

function mergePreview(frame: ResultPreview, generated: Record<string, unknown>, template: ResultTemplate, currency: ResultPreview["currency"]): ResultPreview {
  const loaderSteps = Array.isArray(generated.loaderSteps) ? generated.loaderSteps.map((item) => String(item)).filter(Boolean).slice(0, 4) : frame.loader.steps;
  const draft = blankQuiz("Квиз");
  const parsed = parseQuizSchema({
    ...draft,
    resultPreview: {
      ...frame,
      ...generated,
      template,
      enabled: true,
      currency,
      loader: { ...frame.loader, enabled: frame.loader.enabled, steps: loaderSteps.length ? loaderSteps : frame.loader.steps },
      kpis: generated.kpis ?? frame.kpis,
      table: generated.table === null ? null : generated.table ?? frame.table,
      matches: generated.matches === null ? null : generated.matches ?? frame.matches,
      audit: generated.audit === null ? null : generated.audit ?? frame.audit,
    },
  });
  const parsedPreview = parsed.resultPreview;
  return {
    ...parsedPreview,
    template,
    enabled: true,
    currency,
    revealFullResultOnThankYou: frame.revealFullResultOnThankYou,
    kpis: template === "curated_match" || template === "diagnostic_audit" ? [] : parsedPreview.kpis.length ? parsedPreview.kpis : frame.kpis,
    table: template === "financial_forecast" || template === "estimate_breakdown" ? parsedPreview.table ?? frame.table : null,
    matches: template === "curated_match"
      ? { ...(parsedPreview.matches ?? frame.matches)!, badgeText: "Подобрано {{match_count}} вариантов" }
      : null,
    audit: template === "diagnostic_audit" ? parsedPreview.audit ?? frame.audit : null,
  };
}

function sanitizePreview(preview: ResultPreview, niche: string, key: string): ResultPreview {
  const next = nicheLeak(niche, preview) ? stripLeak(preview, key) : preview;
  const probe = quizWith(next);
  if (previewFormulasOk(probe)) return next;
  return {
    ...next,
    kpis: next.kpis.map((item) => ({ ...item, valueExpr: safeExpr(item.valueExpr, probe, key) })),
    table: next.table
      ? {
          ...next.table,
          rows: next.table.rows.map((row) => ({
            ...row,
            cells: Object.fromEntries(Object.entries(row.cells).map(([cellKey, value]) => [cellKey, next.table?.columns.find((column) => column.key === cellKey)?.format === "text" ? value : safeExpr(value, probe, key)])),
          })),
        }
      : null,
    matches: next.matches
      ? { ...next.matches, items: next.matches.items.map((item) => ({ ...item, priceExpr: safeExpr(item.priceExpr, probe, key) })) }
      : null,
    audit: next.audit ? { ...next.audit, scoreExpr: safeExpr(next.audit.scoreExpr, probe, "72") } : null,
  };
}

function safeExpr(source: string, schema: QuizSchema, key: string) {
  const raw = source.trim();
  if (!raw.startsWith("=") && !/^[0-9a-z_+\-*/().,\s]+$/i.test(raw)) return source;
  const vars = { [key]: 1_500_000, budget: 1_500_000, area: 60, score: 72, match_count: 6 };
  if (evaluateExpr(raw, vars).ok) return source;
  return key === "72" ? "72" : `=${key}`;
}

function quizWith(preview: ResultPreview): QuizSchema {
  return { ...blankQuiz("Квиз"), resultPreview: { ...preview, enabled: true } };
}

function nicheLeak(niche: string, preview: ResultPreview) {
  const blob = JSON.stringify(preview);
  const text = niche.toLowerCase();
  const realty = /спальн|вид на район|ближе к морю/.test(blob) && !/недвиж|квартир|вилл|апартамент|бали|дуба/.test(text);
  const reno = /чернов|м²/.test(blob) && !/ремонт|отделк|площад|квадрат/.test(text);
  return realty || reno;
}

function stripLeak(preview: ResultPreview, key: string): ResultPreview {
  const bad = /спальн|вид на район|ближе к морю|чернов|60 м²|м²/i;
  return {
    ...preview,
    defaultHeadline: bad.test(preview.defaultHeadline) ? "Подборка под ваш запрос" : preview.defaultHeadline,
    defaultDescription: bad.test(preview.defaultDescription) ? "Первый вариант уже совпал с ответами." : preview.defaultDescription,
    matches: preview.matches
      ? {
          ...preview.matches,
          items: preview.matches.items.map((item, index) => ({
            ...item,
            title: bad.test(item.title) ? `Вариант ${index + 1}` : item.title,
            subtitle: bad.test(item.subtitle) ? "Параметры под ваш запрос" : item.subtitle || "Параметры под ваш запрос",
            priceExpr: item.priceExpr || `=${key}`,
          })),
        }
      : null,
    table: preview.table
      ? {
          ...preview.table,
          rows: preview.table.rows.map((row) => ({
            ...row,
            cells: Object.fromEntries(Object.entries(row.cells).map(([cell, value]) => [cell, bad.test(value) ? "Блок расчёта" : value])),
          })),
        }
      : null,
  };
}
