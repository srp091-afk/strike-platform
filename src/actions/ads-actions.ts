"use server";

import * as XLSX from "xlsx";

import { generateAdStrategy, parseAdStrategy, publicModelError } from "@/lib/ad-strategy";
import { plusDaysIso } from "@/lib/ad-project-media";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { formatBriefSummary, parseFormattedBrief, publicFormatError } from "@/lib/format-brief";
import { getOpenAI } from "@/lib/openai";
import { isCreativeLanguage, isFontStyle, isStudioStyleKey, studioStyles } from "@/lib/studio-styles";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type CreateAdProjectState = {
  error: string | null;
  projectId: string | null;
};

export type UploadedTableState = {
  error: string | null;
  summary: string | null;
  raw: unknown;
};

const validationPrompt =
  "Оцени данные. Относятся ли они к бизнесу, продукту или целевой аудитории? Верни JSON: { 'is_valid': boolean, 'reason': 'строка с вежливой причиной на русском, если данные не подходят' }.";

export async function acceptUploadedTable(
  _previous: UploadedTableState,
  formData: FormData,
): Promise<UploadedTableState> {
  let rawData: unknown;
  try {
    await getAuthenticatedUserId();
    rawData = await readUploadedTable(formData.get("file"));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось прочитать таблицу.", summary: null, raw: null };
  }

  let verdict: { is_valid: boolean; reason: string };
  try {
    verdict = await validateBusinessData(rawData);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось проверить данные.", summary: null, raw: null };
  }
  if (!verdict.is_valid) return { error: verdict.reason, summary: null, raw: null };

  return { error: null, summary: summarizeTable(rawData), raw: rawData };
}

export async function createAdCampaign(
  _previous: CreateAdProjectState,
  formData: FormData,
): Promise<CreateAdProjectState> {
  const summary = text(formData.get("brief_summary"));
  const templateId = text(formData.get("template_id"));
  const source = text(formData.get("source"));
  const creativesCount = Number(text(formData.get("creatives_count")));
  const creativeLanguage = text(formData.get("creative_language"));
  const fontStyle = text(formData.get("font_style"));
  const styleKey = text(formData.get("style_key"));

  if (summary.length < 12) return { error: "Бриф ещё не собран.", projectId: null };
  if (!isUuid(templateId)) return { error: "Выберите визуальный стиль.", projectId: null };
  if (source !== "chat" && source !== "table") return { error: "Неизвестный источник брифа.", projectId: null };
  if (!Number.isInteger(creativesCount) || creativesCount < 1 || creativesCount > 5) {
    return { error: "Выберите от 1 до 5 креативов.", projectId: null };
  }
  if (!isCreativeLanguage(creativeLanguage)) return { error: "Выберите язык текста на креативе.", projectId: null };
  if (!isFontStyle(fontStyle)) return { error: "Выберите характер типографики.", projectId: null };
  if (!isStudioStyleKey(styleKey)) return { error: "Выберите визуальный стиль.", projectId: null };
  const styleName = studioStyles.find((style) => style.key === styleKey)?.name ?? styleKey;

  const submittedStrategy = text(formData.get("strategy_data"));
  if (submittedStrategy.length > 200_000) return { error: "Стратегия слишком большая.", projectId: null };
  const submittedFormatted = text(formData.get("formatted_brief"));
  if (submittedFormatted.length > 20_000) return { error: "Оформленный бриф слишком большой.", projectId: null };

  let table: unknown = null;
  if (source === "table") {
    const encoded = text(formData.get("raw_data"));
    if (encoded.length > 1_000_000) return { error: "Таблица слишком большая.", projectId: null };
    try {
      table = encoded ? JSON.parse(encoded) : null;
    } catch {
      return { error: "Таблица повреждена. Загрузите файл ещё раз.", projectId: null };
    }
  }

  let projectId = "";
  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getAuthenticatedUserId();
    const { data: template, error: templateError } = await supabase
      .from("creative_templates")
      .select("id")
      .eq("id", templateId)
      .eq("is_active", true)
      .maybeSingle();
    if (templateError) return { error: templateError.message, projectId: null };
    if (!template) return { error: "Выберите визуальный стиль.", projectId: null };

    const formattedBrief = await resolveFormattedBrief(summary, submittedFormatted);
    const strategy = await resolveStrategy(summary, submittedStrategy, formattedBrief);
    const now = new Date();

    const inserted = await insertProject(supabase, {
      user_id: userId,
      name: campaignName(summary),
      brief_summary: summary,
      template_id: template.id,
      strategy_data: strategy,
      formatted_brief: formattedBrief,
      creatives_count: creativesCount,
      creative_language: creativeLanguage,
      font_style: fontStyle,
      style_key: styleKey,
      updated_at: now.toISOString(),
      creatives_replace_at: plusDaysIso(now, 14),
    });
    if (inserted.error || !inserted.data) {
      const message = inserted.error?.message ?? "Не удалось создать проект.";
      if (/strategy_data/i.test(message)) {
        return { error: "В базе нет колонки strategy_data. Выполните миграцию в Supabase.", projectId: null };
      }
      if (/formatted_brief/i.test(message)) {
        return { error: "В базе нет колонки formatted_brief. Выполните миграцию в Supabase.", projectId: null };
      }
      return { error: message, projectId: null };
    }
    const data = inserted.data;

    projectId = String(data.id);
    const { error: briefError } = await supabase.from("ad_briefs").insert({
      project_id: projectId,
      niche: summary.replace(/\s+/g, " ").trim().slice(0, 120),
      product_details: summary,
      raw_data: {
        source,
        table,
        generation: {
          creatives_count: creativesCount,
          creative_language: creativeLanguage,
          font_style: fontStyle,
          style_key: styleKey,
          style_name: styleName,
        },
      },
    });
    if (briefError) {
      await supabase.from("ad_projects").delete().eq("id", projectId).eq("user_id", userId);
      return { error: briefError.message, projectId: null };
    }
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Не удалось сохранить проект.",
      projectId: null,
    };
  }

  return { error: null, projectId };
}

async function insertProject(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  row: {
    user_id: string;
    name: string;
    brief_summary: string;
    template_id: string;
    strategy_data: unknown;
    formatted_brief: unknown;
    creatives_count: number;
    creative_language: string;
    font_style: string;
    style_key: string;
    updated_at: string;
    creatives_replace_at: string;
  },
) {
  const first = await supabase.from("ad_projects").insert(row).select("id").single();
  if (!first.error) return first;

  const {
    creatives_count: _count,
    creative_language: _language,
    font_style: _font,
    style_key: _style,
    updated_at: _updated,
    creatives_replace_at: _replace,
    formatted_brief,
    ...core
  } = row;
  const missingDates = /updated_at|creatives_replace_at/i.test(first.error.message);
  const missingSettings = /creatives_count|creative_language|font_style|style_key/i.test(first.error.message);
  const missingFormatted = /formatted_brief/i.test(first.error.message);
  if (!missingSettings && !missingFormatted && !missingDates) return first;

  let payload: Record<string, unknown> = { ...row };
  if (missingDates) {
    const { updated_at: _u, creatives_replace_at: _r, ...withoutDates } = payload as typeof row;
    payload = withoutDates;
  }
  if (missingSettings) {
    const {
      creatives_count: _c,
      creative_language: _l,
      font_style: _f,
      style_key: _s,
      ...rest
    } = payload as typeof row;
    payload = rest;
  }
  if (missingFormatted) {
    const { formatted_brief: _fb, ...rest } = payload;
    payload = rest;
  }

  const second = await supabase.from("ad_projects").insert(payload).select("id").single();
  if (!second.error) return second;
  if (/formatted_brief/i.test(second.error.message)) {
    const { formatted_brief: _drop, ...rest } = payload;
    return supabase.from("ad_projects").insert(rest).select("id").single();
  }
  return second;
}

async function resolveFormattedBrief(summary: string, submitted: string) {
  if (submitted) {
    try {
      const parsed = parseFormattedBrief(JSON.parse(submitted) as unknown);
      if (parsed) return parsed;
    } catch {
      // Client copy is optional; generate below if missing.
    }
  }

  try {
    return await formatBriefSummary(summary);
  } catch (error) {
    throw new Error(publicFormatError(error));
  }
}

async function resolveStrategy(
  summary: string,
  submitted: string,
  formattedBrief: Awaited<ReturnType<typeof resolveFormattedBrief>>,
) {
  if (submitted) {
    try {
      const parsed = parseAdStrategy(JSON.parse(submitted) as unknown);
      if (parsed) return parsed;
    } catch {
      // The client payload is optional. A missing or broken copy is generated below.
    }
  }

  try {
    return await generateAdStrategy(summary, formattedBrief);
  } catch (error) {
    throw new Error(publicModelError(error));
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function campaignName(summary: string) {
  const clean = summary.replace(/\s+/g, " ").trim();
  const head = clean.split(/[.!?\n]/)[0]?.trim() || clean;
  if (head.length <= 72) return head || "AI-кампания";
  const cut = head.slice(0, 72);
  const space = cut.lastIndexOf(" ");
  return `${(space > 24 ? cut.slice(0, space) : cut).trim()}…`;
}

function summarizeTable(raw: unknown) {
  const rows = flattenRows(raw).slice(0, 40);
  const lines = rows.map((row) => {
    if (!row || typeof row !== "object") return String(row ?? "");
    return Object.entries(row as Record<string, unknown>)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join("; ");
  });
  const summary = lines.join("\n").replace(/\s+\n/g, "\n").trim();
  return summary.slice(0, 4000);
}

function flattenRows(raw: unknown): unknown[] {
  if (Array.isArray(raw) && raw.every((item) => item && typeof item === "object" && "rows" in (item as object))) {
    return raw.flatMap((item) => {
      const rows = (item as { rows?: unknown }).rows;
      return Array.isArray(rows) ? rows : [];
    });
  }
  return Array.isArray(raw) ? raw : [raw];
}

async function validateBusinessData(payload: unknown) {
  const source = typeof payload === "string" ? payload : JSON.stringify(payload);
  if (source.length > 24000) {
    return { is_valid: false, reason: "Данных слишком много для проверки. Сократите бриф или таблицу." };
  }

  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: validationPrompt },
      { role: "user", content: source },
    ],
  });

  return readVerdict(completion.choices[0]?.message?.content ?? "");
}

function readVerdict(content: string) {
  try {
    const parsed = JSON.parse(content) as { is_valid?: unknown; reason?: unknown };
    if (parsed.is_valid === true) return { is_valid: true, reason: "" };
    const reason =
      typeof parsed.reason === "string" && parsed.reason.trim()
        ? parsed.reason.trim()
        : "Эти данные не похожи на описание бизнеса, продукта или аудитории.";
    return { is_valid: false, reason };
  } catch {
    return { is_valid: false, reason: "Не удалось проверить данные. Попробуйте ещё раз." };
  }
}

async function readUploadedTable(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || value.size === 0) {
    throw new Error("Загрузите таблицу в формате XLSX или CSV.");
  }
  if (value.size > 1_000_000) throw new Error("Файл больше 1 МБ. Загрузите таблицу поменьше.");

  const fileName = value.name.toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".csv")) {
    throw new Error("Нужен файл .xlsx или .csv.");
  }

  const buffer = Buffer.from(await value.arrayBuffer());
  const csv = fileName.endsWith(".csv");
  const text = csv ? buffer.toString("utf8") : "";
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const semicolon = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  const workbook = XLSX.read(csv ? text : buffer, {
    type: csv ? "string" : "buffer",
    ...(csv && semicolon > comma ? { FS: ";" } : {}),
  });

  const tables = workbook.SheetNames.flatMap((sheet) => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet], { defval: "" });
    return rows.length > 0 ? [{ sheet, rows }] : [];
  });
  if (tables.length === 0) throw new Error("В таблице нет строк для проверки.");
  return tables.length === 1 ? tables[0].rows : tables;
}

function text(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}
