"use server";

import { redirect } from "next/navigation";
import * as XLSX from "xlsx";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getOpenAI } from "@/lib/openai";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type CreateAdProjectState = {
  error: string | null;
};

const validationPrompt =
  "Оцени данные. Относятся ли они к бизнесу, продукту или целевой аудитории? Верни JSON: { 'is_valid': boolean, 'reason': 'строка с вежливой причиной на русском, если данные не подходят' }.";

export async function createAdProject(
  _previous: CreateAdProjectState,
  formData: FormData,
): Promise<CreateAdProjectState> {
  const name = text(formData.get("name"));
  const niche = text(formData.get("niche"));
  const format = text(formData.get("format"));

  if (!name) return { error: "Укажите название проекта." };
  if (!niche) return { error: "Укажите нишу." };
  if (format !== "brief" && format !== "table") return { error: "Выберите формат брифа." };

  let rawData: unknown;
  try {
    rawData = format === "brief" ? { text: text(formData.get("brief")) } : await readUploadedTable(formData.get("file"));
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось прочитать бриф." };
  }

  const payload = format === "brief" ? (rawData as { text: string }).text : rawData;
  if (format === "brief" && !String(payload).trim()) {
    return { error: "Опишите продукт, его сильные стороны и идеального клиента." };
  }

  let verdict: { is_valid: boolean; reason: string };
  try {
    verdict = await validateBusinessData(payload);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось проверить данные." };
  }
  if (!verdict.is_valid) return { error: verdict.reason };

  let projectId = "";
  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getAuthenticatedUserId();
    const { data, error } = await supabase
      .from("ad_projects")
      .insert({ user_id: userId, name })
      .select("id")
      .single();
    if (error || !data) return { error: error?.message ?? "Не удалось создать проект." };

    projectId = String(data.id);
    const { error: briefError } = await supabase.from("ad_briefs").insert({
      project_id: projectId,
      niche,
      raw_data: rawData,
    });
    if (briefError) {
      await supabase.from("ad_projects").delete().eq("id", projectId).eq("user_id", userId);
      return { error: briefError.message };
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Не удалось сохранить проект." };
  }

  redirect(`/ads/${projectId}`);
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
