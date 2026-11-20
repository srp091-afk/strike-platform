import "server-only";

import mammoth from "mammoth";
import * as XLSX from "xlsx";

import { getOpenAI } from "@/lib/openai";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;
const MAX_CHUNKS = 100;
const MATCH_THRESHOLD = 0.3;
const MATCH_COUNT = 4;

const KNOWLEDGE_CONTEXT =
  "Контекст из базы знаний компании: \n\n {chunks} \n\n Используй эту информацию для точных ответов на вопросы пользователя.";

type Extension = "pdf" | "docx" | "txt" | "csv" | "xlsx";

export async function indexKnowledgeFile(input: {
  agentId: string;
  fileId: string;
  extension: Extension;
  buffer: Buffer;
}) {
  const text = (await extractText(input.extension, input.buffer)).replace(/\u0000/g, "").trim();
  if (text.length < 20) throw new Error("В файле не нашлось текста для базы знаний.");
  const chunks = splitKnowledgeText(text).slice(0, MAX_CHUNKS);
  if (chunks.length === 0) throw new Error("В файле не нашлось текста для базы знаний.");

  const embeddings = await embedTexts(chunks);
  const admin = createSupabaseAdminClient();
  const rows = chunks.map((content, index) => ({
    agent_id: input.agentId,
    file_id: input.fileId,
    content,
    embedding: vectorLiteral(embeddings[index] ?? []),
  }));
  for (let index = 0; index < rows.length; index += 40) {
    const { error } = await admin.from("knowledge_chunks").insert(rows.slice(index, index + 40));
    if (error) {
      if (/knowledge_chunks|vector|schema cache/i.test(error.message)) {
        throw new Error("Примените миграцию 20261120_knowledge_chunks.sql.");
      }
      throw new Error(error.message);
    }
  }
}

/** Добавляет найденные фрагменты в системный промпт. Пустой поиск и ошибка базы не ломают ответ. */
export async function withKnowledge(systemPrompt: string, agentId: string, question: string) {
  const query = question.trim();
  if (!agentId || !query) return systemPrompt;
  try {
    const [embedding] = await embedTexts([query.slice(0, 8000)]);
    if (!embedding) return systemPrompt;
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.rpc("match_knowledge_chunks", {
      query_embedding: vectorLiteral(embedding),
      match_agent_id: agentId,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT,
    });
    if (error) {
      if (!/match_knowledge_chunks|knowledge_chunks|schema cache/i.test(error.message)) {
        console.error("[knowledge]", error.message);
      }
      return systemPrompt;
    }
    const chunks = (Array.isArray(data) ? data : [])
      .map((row) => (row && typeof row === "object" && "content" in row ? String(row.content).trim() : ""))
      .filter(Boolean);
    if (chunks.length === 0) return systemPrompt;
    return `${systemPrompt}\n\n${KNOWLEDGE_CONTEXT.replace("{chunks}", chunks.join("\n\n"))}`;
  } catch (error) {
    console.error("[knowledge]", error instanceof Error ? error.message : error);
    return systemPrompt;
  }
}

async function extractText(extension: Extension, buffer: Buffer) {
  if (extension === "txt" || extension === "csv") return buffer.toString("utf8");
  if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (extension === "xlsx") return extractSpreadsheet(buffer);
  const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default as (data: Buffer) => Promise<{ text?: string }>;
  const parsed = await pdfParse(buffer);
  return parsed.text ?? "";
}

function extractSpreadsheet(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new Error("Не удалось прочитать Excel-файл.");
  }
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  } catch {
    throw new Error("Не удалось прочитать Excel-файл.");
  }
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return "";
    const csv = XLSX.utils
      .sheet_to_csv(sheet, { blankrows: false })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.replace(/[,"]/g, "").length > 0)
      .join("\n");
    if (!csv) return "";
    return `# ${name}\n${csv}`;
  })
    .filter(Boolean)
    .join("\n\n");
}

async function embedTexts(input: string[]) {
  const vectors: number[][] = [];
  for (let index = 0; index < input.length; index += 64) {
    const batch = input.slice(index, index + 64);
    const response = await getOpenAI().embeddings.create({ model: EMBEDDING_MODEL, input: batch });
    const ordered = [...response.data].sort((left, right) => left.index - right.index);
    vectors.push(...ordered.map((item) => item.embedding));
  }
  return vectors;
}

function vectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}

/** Разбивка как у RecursiveCharacterTextSplitter: абзацы, строки, слова, затем символы. */
export function splitKnowledgeText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  return applyOverlap(split(normalized, ["\n\n", "\n", " ", ""], size), overlap)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

function split(text: string, separators: string[], size: number): string[] {
  if (text.length <= size) return [text];
  const separator = separators.find((item) => item.length === 0 || text.includes(item)) ?? "";
  const rest = separators.slice(separators.indexOf(separator) + 1);
  if (!separator) {
    const pieces: string[] = [];
    for (let index = 0; index < text.length; index += size) pieces.push(text.slice(index, index + size));
    return pieces;
  }
  const chunks: string[] = [];
  let current = "";
  for (const part of text.split(separator)) {
    const joined = current ? `${current}${separator}${part}` : part;
    if (joined.length <= size) {
      current = joined;
      continue;
    }
    if (current) chunks.push(current);
    if (part.length > size) {
      const nested = split(part, rest, size);
      chunks.push(...nested.slice(0, -1));
      current = nested.at(-1) ?? "";
    } else current = part;
  }
  if (current) chunks.push(current);
  return chunks;
}

function applyOverlap(chunks: string[], overlap: number) {
  if (overlap <= 0 || chunks.length < 2) return chunks;
  return chunks.map((chunk, index) => {
    if (index === 0) return chunk;
    const tail = chunks[index - 1].slice(-overlap);
    return chunk.startsWith(tail) ? chunk : `${tail}${chunk}`;
  });
}
