"use server";

import { redirect } from "next/navigation";
import * as XLSX from "xlsx";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { findCreativeTemplate } from "@/lib/creative-templates";
import { getOpenAI } from "@/lib/openai";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type CreateAdProjectState = {
  error: string | null;
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
  const template = findCreativeTemplate(templateId);

  if (summary.length < 12) return { error: "Бриф ещё не собран." };
  if (!template) return { error: "Выберите визуальный стиль." };
  if (source !== "chat" && source !== "table") return { error: "Неизвестный источник брифа." };

  let table: unknown = null;
  if (source === "table") {
    const encoded = text(formData.get("raw_data"));
    if (encoded.length > 1_000_000) return { error: "Таблица слишком большая." };
    try {
      table = encoded ? JSON.parse(encoded) : null;
    } catch {
      return { error: "Таблица повреждена. Загрузите файл ещё раз." };
    }
  }

  let projectId = "";
  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getAuthenticatedUserId();
    const { data, error } = await supabase
      .from("ad_projects")
      .insert({ user_id: userId, name: campaignName(summary) })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Не удалось создать проект." };

    projectId = String(data.id);
    const { error: briefError } = await supabase.from("ad_briefs").insert({
      project_id: projectId,
      niche: summary.replace(/\s+/g, " ").trim().slice(0, 120),
      product_details: summary,
      raw_data: {
        brief_summary: summary,
        template_id: template.id,
        source,
        table,
      },
    });
    if (briefError) {
      await supabase.from("ad_projects").delete().eq("id", projectId).eq("user_id", userId);
      return { error: briefError.message };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось сохранить проект." };
  }

  redirect("/ads");
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
