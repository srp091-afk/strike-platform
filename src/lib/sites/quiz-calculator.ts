import type { CompareOp, QuizSchema, ResultPreview, ValueFormat } from "@/lib/sites/quiz-schema";
import { presetForTemplate, templateFromHint } from "@/lib/sites/result-presets";

export type QuizAnswerInput = { optionIds?: string[]; text?: string; value?: number };

export type ComputedCell = { text: string; raw: number | null };
export type ComputedQuizResult = {
  enabled: boolean;
  template: ResultPreview["template"];
  matchedRuleName: string;
  eyebrow: string;
  headline: string;
  description: string;
  kpis: Array<{ id: string; label: string; text: string; raw: number | null; accent: boolean }>;
  table: {
    columns: Array<{ key: string; label: string; align: "left" | "right" }>;
    rows: Array<{ id: string; locked: boolean; cells: ComputedCell[] }>;
  } | null;
  matches: {
    badgeText: string;
    items: Array<{ id: string; title: string; subtitle: string; price: string; metric: string; imageUrl: string | null; locked: boolean }>;
  } | null;
  audit: {
    score: number;
    scoreLabel: string;
    impact: string;
    insights: Array<{ id: string; title: string; detail: string; locked: boolean }>;
  } | null;
  lockBadgeText: string;
  footnote: string;
  revealFullResultOnThankYou: boolean;
  variablesUsed: Record<string, number>;
  labelsUsed: Record<string, string>;
  plainTextSummary: string;
};

type Token =
  | { kind: "num"; value: number }
  | { kind: "id"; value: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lp" }
  | { kind: "rp" }
  | { kind: "comma" };

const FUNCS = new Set(["round", "floor", "ceil", "min", "max"]);

export function evaluateExpr(source: string, vars: Record<string, number>): { value: number; ok: boolean } {
  try {
    const tokens = tokenize(source.trim().replace(/^=/, ""));
    if (!tokens) return { value: 0, ok: false };
    const parser = new Parser(tokens, vars);
    const value = parser.parse();
    if (!parser.ok || !parser.done() || !Number.isFinite(value)) return { value: 0, ok: false };
    return { value, ok: true };
  } catch {
    return { value: 0, ok: false };
  }
}

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (char === " " || char === "\n" || char === "\t") {
      i += 1;
      continue;
    }
    if (char === "+" || char === "-" || char === "*" || char === "/") {
      tokens.push({ kind: "op", value: char });
      i += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "lp" });
      i += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "rp" });
      i += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ kind: "comma" });
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let end = i + 1;
      while (end < input.length && /[0-9.]/.test(input[end])) end += 1;
      const value = Number(input.slice(i, end));
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: "num", value });
      i = end;
      continue;
    }
    if (/[a-zA-Z_]/.test(char)) {
      let end = i + 1;
      while (end < input.length && /[a-zA-Z0-9_]/.test(input[end])) end += 1;
      tokens.push({ kind: "id", value: input.slice(i, end).toLowerCase() });
      i = end;
      continue;
    }
    return null;
  }
  return tokens;
}

class Parser {
  private index = 0;
  ok = true;
  constructor(
    private tokens: Token[],
    private vars: Record<string, number>,
  ) {}

  done() {
    return this.index >= this.tokens.length;
  }

  parse() {
    const value = this.expr();
    return value;
  }

  private peek() {
    return this.tokens[this.index];
  }

  private expr(): number {
    let value = this.term();
    let token = this.peek();
    while (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
      const op = token.value;
      this.index += 1;
      const right = this.term();
      value = op === "-" ? value - right : value + right;
      token = this.peek();
    }
    return value;
  }

  private term(): number {
    let value = this.unary();
    let token = this.peek();
    while (token?.kind === "op" && (token.value === "*" || token.value === "/")) {
      const op = token.value;
      this.index += 1;
      const right = this.unary();
      if (op === "/" && right === 0) {
        this.ok = false;
        value = 0;
      } else value = op === "/" ? value / right : value * right;
      token = this.peek();
    }
    return value;
  }

  private unary(): number {
    const token = this.peek();
    if (token?.kind === "op" && (token.value === "+" || token.value === "-")) {
      const sign = token.value === "-" ? -1 : 1;
      this.index += 1;
      return sign * this.unary();
    }
    return this.primary();
  }

  private primary(): number {
    const token = this.peek();
    if (!token) {
      this.ok = false;
      return 0;
    }
    if (token.kind === "num") {
      this.index += 1;
      return token.value;
    }
    if (token.kind === "id") {
      this.index += 1;
      if (this.peek()?.kind === "lp") {
        if (!FUNCS.has(token.value)) {
          this.ok = false;
          return 0;
        }
        this.index += 1;
        const args = [this.expr()];
        if (this.peek()?.kind === "comma") {
          this.index += 1;
          args.push(this.expr());
        }
        if (this.peek()?.kind !== "rp") this.ok = false;
        else this.index += 1;
        return applyFn(token.value, args);
      }
      return this.vars[token.value] ?? 0;
    }
    if (token.kind === "lp") {
      this.index += 1;
      const value = this.expr();
      if (this.peek()?.kind !== "rp") this.ok = false;
      else this.index += 1;
      return value;
    }
    this.ok = false;
    return 0;
  }
}

function applyFn(name: string, args: number[]) {
  const [a = 0, b = 0] = args;
  if (name === "round") return Math.round(a);
  if (name === "floor") return Math.floor(a);
  if (name === "ceil") return Math.ceil(a);
  if (name === "min") return Math.min(a, args.length > 1 ? b : a);
  if (name === "max") return Math.max(a, args.length > 1 ? b : a);
  return 0;
}

export function extractQuizVariables(
  schema: QuizSchema,
  answers: Record<string, QuizAnswerInput>,
  options?: { useSampleFallback?: boolean },
) {
  const variables: Record<string, number> = {};
  const labels: Record<string, string> = {};
  for (const step of schema.steps) {
    const key = step.variableKey;
    if (!key) continue;
    const answer = answers[step.id];
    const chosen = step.options.filter((item) => answer?.optionIds?.includes(item.id));
    if (step.type === "range_slider" || step.type === "text_input") {
      const direct = answer ? Number(step.type === "range_slider" ? answer.value : firstNumber(answer.text ?? "")) : NaN;
      variables[key] = Number.isFinite(direct) ? direct : options?.useSampleFallback ? (step.defaultNumericValue ?? midpoint(step)) : 0;
      if (answer?.text) labels[key] = answer.text;
    } else if (step.type === "multi_choice") {
      const selected = chosen.length > 0 ? chosen : options?.useSampleFallback ? step.options.slice(0, 1) : [];
      variables[key] = selected.reduce((sum, item) => sum + optionNumber(item, step.defaultNumericValue), 0);
      labels[key] = (chosen.length > 0 ? chosen : selected).map((item) => item.label).join(", ");
    } else {
      const option = chosen[0] ?? (options?.useSampleFallback ? step.options[Math.floor(Math.max(0, step.options.length - 1) / 2)] : undefined);
      variables[key] = option ? optionNumber(option, step.defaultNumericValue) : step.defaultNumericValue ?? 0;
      if (option) labels[key] = option.label;
    }
  }
  if (options?.useSampleFallback && schema.resultPreview.sampleDefaults) {
    for (const [key, value] of Object.entries(schema.resultPreview.sampleDefaults)) {
      if (variables[key] === undefined) variables[key] = value;
    }
  }
  for (const [key, value] of Object.entries(labels)) labels[`${key}_label`] = value;
  return { variables, labels };
}

function optionNumber(option: { label: string; numericValue?: number }, fallback?: number) {
  if (option.numericValue !== undefined && Number.isFinite(option.numericValue)) return option.numericValue;
  const parsed = firstNumber(option.label);
  if (parsed !== null) return parsed;
  return fallback ?? 0;
}

function firstNumber(value: string) {
  const match = value.replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function midpoint(step: QuizSchema["steps"][number]) {
  if (step.type === "range_slider") return step.sliderConfig.defaultValue || Math.round((step.sliderConfig.min + step.sliderConfig.max) / 2);
  return step.defaultNumericValue ?? 0;
}

export function formatValue(value: number, format: ValueFormat, currency: ResultPreview["currency"]) {
  if (!Number.isFinite(value)) return "0";
  if (format === "percent") return `${trimNumber(value, Math.max(currency.decimals, value % 1 === 0 ? 0 : 1))}%`;
  if (format === "text" || format === "number") return grouped(value, format === "number" ? currency.decimals : 0);
  const compact = compactCurrency(value, currency.decimals);
  return currency.position === "before" ? `${currency.symbol}${compact}` : `${compact} ${currency.symbol}`;
}

function grouped(value: number, decimals: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(value);
}

function trimNumber(value: number, decimals: number) {
  return grouped(value, decimals);
}

function compactCurrency(value: number, decimals: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${smart(value / 1_000_000_000)} млрд`;
  if (abs >= 1_000_000) return `${smart(value / 1_000_000)} млн`;
  return grouped(value, decimals);
}

function smart(value: number) {
  const places = Math.abs(value - Math.round(value)) < 0.05 ? 0 : 1;
  return trimNumber(places === 0 ? Math.round(value) : value, places);
}

function isMath(source: string) {
  const raw = source.trim();
  if (!raw) return false;
  if (raw.startsWith("=")) return true;
  if (raw.includes("{{")) return false;
  return /^[0-9a-z_+\-*/().,\s]+$/i.test(raw) && (/[+\-*/()]/.test(raw) || /^[a-z_][a-z0-9_]*$/i.test(raw) || /^-?\d/.test(raw));
}

export function renderPiece(source: string, vars: Record<string, number>, labels: Record<string, string>, currency: ResultPreview["currency"], format: ValueFormat = "currency") {
  const raw = source.trim();
  if (!raw) return { text: "", raw: null as number | null, ok: true };
  if (raw.includes("{{")) {
    let ok = true;
    const text = raw.replace(/\{\{\s*([^{}]+)\s*\}\}/g, (_all, expr: string) => {
      const key = expr.trim().toLowerCase();
      if (labels[key]) return labels[key];
      const result = evaluateExpr(expr, vars);
      if (!result.ok) ok = false;
      const money = format === "currency" && (/^(budget|ad_spend|price|cost|amount|aov|revenue)$/.test(key) || raw.trim() === `{{${expr.trim()}}}`);
      if (money) return formatValue(result.value, "currency", currency);
      if (format === "percent" && raw.trim() === `{{${expr.trim()}}}`) return formatValue(result.value, "percent", currency);
      return grouped(result.value, 0);
    });
    return { text, raw: null, ok };
  }
  if (isMath(raw)) {
    const result = evaluateExpr(raw, vars);
    return { text: format === "text" ? result.value.toString() : formatValue(result.value, format, currency), raw: result.value, ok: result.ok };
  }
  return { text: raw, raw: null, ok: true };
}

function matchesRule(left: number, operator: CompareOp, right: number) {
  if (operator === "lt") return left < right;
  if (operator === "lte") return left <= right;
  if (operator === "gt") return left > right;
  if (operator === "gte") return left >= right;
  return Math.abs(left - right) < 0.000001;
}

export function computeQuizResult(
  schema: QuizSchema,
  answers: Record<string, QuizAnswerInput>,
  options?: { useSampleFallback?: boolean; overrides?: Record<string, number> },
): ComputedQuizResult {
  const preview = schema.resultPreview ?? {
    enabled: false,
    template: "financial_forecast" as const,
    loader: { enabled: false, durationMs: 1300, steps: [] },
    currency: { symbol: "$", position: "before" as const, decimals: 0 },
    eyebrow: "",
    defaultHeadline: "",
    defaultDescription: "",
    rules: [],
    kpis: [],
    table: null,
    matches: null,
    audit: null,
    lockBadgeText: "",
    footnote: "",
    revealFullResultOnThankYou: false,
  };
  const extracted = extractQuizVariables(schema, answers, options);
  let variables = { ...extracted.variables, ...(options?.overrides ?? {}) };
  let headline = preview.defaultHeadline;
  let description = preview.defaultDescription;
  let eyebrow = preview.eyebrow;
  let matchedRuleName = "";
  for (const rule of preview.rules) {
    if (!matchesRule(variables[rule.variable] ?? 0, rule.operator, rule.value)) continue;
    matchedRuleName = rule.headline || rule.id;
    if (rule.headline) headline = rule.headline;
    if (rule.description) description = rule.description;
    if (rule.overrideVariables) variables = { ...variables, ...rule.overrideVariables };
    break;
  }
  const fill = (source: string, format: ValueFormat = "currency") => renderPiece(source, variables, extracted.labels, preview.currency, format);
  const kpis = preview.kpis.slice(0, 3).map((item) => {
    const rendered = fill(item.valueExpr, item.format);
    return { id: item.id, label: item.label, text: rendered.text, raw: rendered.raw, accent: item.accent === true };
  });
  const table = preview.table
    ? {
        columns: preview.table.columns.map((column) => ({ key: column.key, label: column.label, align: column.align ?? "left" })),
        rows: preview.table.rows.map((row) => ({
          id: row.id,
          locked: row.locked,
          cells: preview.table!.columns.map((column) => {
            const rendered = fill(row.cells[column.key] ?? "", column.format);
            return { text: rendered.text, raw: rendered.raw };
          }),
        })),
      }
    : null;
  const matches = preview.matches
    ? {
        badgeText: fill(preview.matches.badgeText, "text").text,
        items: preview.matches.items.map((item) => ({
          id: item.id,
          title: fill(item.title, "text").text,
          subtitle: fill(item.subtitle, "text").text,
          price: fill(item.priceExpr, "currency").text,
          metric: fill(item.metricText, "text").text,
          imageUrl: item.imageUrl ?? null,
          locked: item.locked,
        })),
      }
    : null;
  const audit = preview.audit
    ? {
        score: Math.min(100, Math.max(0, Math.round(evaluateExpr(preview.audit.scoreExpr.replace(/^=/, ""), variables).value))),
        scoreLabel: preview.audit.scoreLabel,
        impact: fill(preview.audit.impactExpr, "text").text,
        insights: preview.audit.insights.map((item) => ({
          id: item.id,
          title: fill(item.title, "text").text,
          detail: fill(item.detail, "text").text,
          locked: item.locked,
        })),
      }
    : null;
  const headlineText = fill(headline, "currency").text;
  const descriptionText = fill(description, "text").text;
  const lines = [
    matchedRuleName ? `Программа: ${matchedRuleName}` : "",
    headlineText,
    descriptionText,
    ...kpis.map((item) => `${item.label}: ${item.text}`),
    ...(table ? table.rows.flatMap((row) => [`${row.cells.map((cell) => cell.text).join(" | ")}${row.locked ? " (скрыто до заявки)" : ""}`]) : []),
    ...(matches ? matches.items.map((item) => `${item.title}: ${item.price}${item.locked ? " (скрыто до заявки)" : ""}`) : []),
    ...(audit ? [`${audit.scoreLabel}: ${audit.score}`, audit.impact, ...audit.insights.map((item) => `${item.title}: ${item.detail}`)] : []),
  ].filter(Boolean);
  return {
    enabled: preview.enabled === true,
    template: preview.template,
    matchedRuleName,
    eyebrow,
    headline: headlineText,
    description: descriptionText,
    kpis,
    table,
    matches,
    audit,
    lockBadgeText: preview.lockBadgeText,
    footnote: preview.footnote,
    revealFullResultOnThankYou: preview.revealFullResultOnThankYou === true,
    variablesUsed: variables,
    labelsUsed: extracted.labels,
    plainTextSummary: lines.join("\n"),
  };
}

export function previewFormulasOk(schema: QuizSchema) {
  const sample = computeQuizResult(schema, {}, { useSampleFallback: true });
  const preview = schema.resultPreview;
  if (!preview?.enabled) return true;
  const pieces = [
    ...preview.kpis.map((item) => item.valueExpr),
    ...(preview.table?.rows.flatMap((row) => Object.values(row.cells)) ?? []),
    ...(preview.matches?.items.map((item) => item.priceExpr) ?? []),
    preview.audit?.scoreExpr ?? "",
    preview.audit?.impactExpr ?? "",
  ].filter((item) => item.trim().startsWith("=") || isMath(item));
  const vars = sample.variablesUsed;
  if (pieces.some((item) => !evaluateExpr(item, vars).ok)) return false;
  const hasBody = sample.kpis.length > 0 || (sample.table?.rows.length ?? 0) > 0 || (sample.matches?.items.length ?? 0) > 0 || (sample.audit?.insights.length ?? 0) > 0;
  return hasBody;
}

export function repairGeneratedPreview(schema: QuizSchema, hint: string): QuizSchema {
  const hasBody = schema.resultPreview.kpis.length > 0 || Boolean(schema.resultPreview.table) || Boolean(schema.resultPreview.matches) || Boolean(schema.resultPreview.audit);
  const template = hasBody ? schema.resultPreview.template : templateFromHint(hint);
  const turnedOn: QuizSchema = { ...schema, resultPreview: { ...schema.resultPreview, template, enabled: true } };
  const lead = turnedOn.leadScreen.headline === "Куда отправить результат?"
    ? { ...turnedOn.leadScreen, headline: "Куда прислать полный расчёт?" }
    : turnedOn.leadScreen;
  if (hasBody && previewFormulasOk(turnedOn)) return { ...turnedOn, leadScreen: lead };
  return {
    ...turnedOn,
    leadScreen: lead,
    resultPreview: { ...presetForTemplate(template, hint), enabled: true },
  };
}
