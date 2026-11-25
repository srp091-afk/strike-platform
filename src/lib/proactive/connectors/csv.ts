import { createHash } from "node:crypto";

import type { DataSourceAdapter, SourceEntity } from "@/lib/proactive/connectors/types";

const MAX_ROWS = 2000;

const NAME_HEADER = /имя|фио|name|клиент|contact/i;
const PHONE_HEADER = /тел|phone|whatsapp|номер|mobile/i;
const EMAIL_HEADER = /mail|почт|email/i;
const TELEGRAM_HEADER = /telegram|телег|^tg$|username/i;
const NOTE_HEADER = /коммент|причин|контекст|note|comment|отказ|message/i;

export function parseCsv(text: string) {
  const rows = splitRows(text.replace(/^\uFEFF/, "").trim());
  if (rows.length === 0) return { columns: [] as string[], records: [] as Record<string, string>[] };
  const columns = rows[0].map((cell, index) => cell.trim() || `Колонка ${index + 1}`);
  const records = rows.slice(1, MAX_ROWS + 1).map((cells) => {
    const record: Record<string, string> = {};
    columns.forEach((column, index) => {
      record[column] = (cells[index] ?? "").trim();
    });
    return record;
  });
  return { columns, records: records.filter((record) => Object.values(record).some((value) => value)) };
}

export function entitiesFromRecords(records: Record<string, string>[]): SourceEntity[] {
  return records.map((record) => {
    const columns = Object.keys(record);
    const name = pick(record, columns, NAME_HEADER);
    const phone = pick(record, columns, PHONE_HEADER).replace(/[^\d+]/g, "");
    const email = pick(record, columns, EMAIL_HEADER).toLowerCase();
    const telegram = pick(record, columns, TELEGRAM_HEADER).replace(/\s/g, "");
    const note = pick(record, columns, NOTE_HEADER);
    const context = [note, ...columns.filter((column) => record[column] && column !== note).map((column) => `${column}: ${record[column]}`)]
      .filter(Boolean)
      .join("\n")
      .slice(0, 2000);
    return {
      externalId: createHash("sha256").update(JSON.stringify(record)).digest("hex").slice(0, 32),
      name: name || email || phone || "Контакт",
      phone,
      email,
      telegram,
      context,
      payload: record,
    };
  });
}

function pick(record: Record<string, string>, columns: string[], pattern: RegExp) {
  const column = columns.find((item) => pattern.test(item));
  return column ? (record[column] ?? "").trim() : "";
}

function splitRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export const csvAdapter: DataSourceAdapter = {
  async testConnection(config) {
    const records = readRecords(config);
    if (records.length === 0) return { ok: false, error: "В CSV нет строк." };
    return { ok: true, detail: `Строк: ${records.length}` };
  },
  async fetchEntities(config) {
    return entitiesFromRecords(readRecords(config));
  },
  async executePostAction() {},
};

function readRecords(config: Record<string, unknown>) {
  const rows = config.rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter((row): row is Record<string, string> => Boolean(row) && typeof row === "object" && !Array.isArray(row)).slice(0, MAX_ROWS);
}
