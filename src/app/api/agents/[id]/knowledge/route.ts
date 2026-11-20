import { connection } from "next/server";

import { deniedStatus, getEffectiveUserId } from "@/lib/account-context";
import { indexKnowledgeFile } from "@/lib/knowledge";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 120;

const BUCKET = "knowledge_bases";
const MAX_BYTES = 10 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSIONS = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

type Extension = keyof typeof EXTENSIONS;

function statusOf(error: unknown) {
  if (error instanceof Error && error.message.includes("Нужно войти")) return 401;
  return deniedStatus(error);
}

function migrationMissing(message: string) {
  return /agent_knowledge_files|schema cache/i.test(message);
}

function fileBase(name: string) {
  return name.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() || "file";
}

/** Имя в списке файлов. Кириллица здесь допустима: это поле базы, не ключ Storage. */
function displayFileName(name: string) {
  return fileBase(name).slice(0, 180) || "file";
}

/** Ключ объекта. Storage принимает только ASCII, поэтому «для сергея сайт.xlsx» становится file.xlsx. */
function storageFileName(name: string, extension: Extension) {
  const stem = fileBase(name).replace(/\.[^.]+$/, "");
  const ascii = stem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${ascii || "file"}.${extension}`;
}

function extensionOf(name: string): Extension | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext in EXTENSIONS ? (ext as Extension) : null;
}

function objectPath(fileUrl: string) {
  if (!fileUrl.includes("://")) return fileUrl.replace(/^\/+/, "");
  const marker = `/${BUCKET}/`;
  const index = fileUrl.indexOf(marker);
  if (index === -1) return "";
  return decodeURIComponent(fileUrl.slice(index + marker.length).split("?")[0] ?? "");
}

async function ownedAgent(agentId: string) {
  if (!UUID_PATTERN.test(agentId)) return null;
  const userId = await getEffectiveUserId();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("agents").select("id").eq("id", agentId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return admin;
}

async function ensureBucket() {
  const admin = createSupabaseAdminClient();
  const options = {
    public: false,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: [...Object.values(EXTENSIONS)],
  };
  const existing = await admin.storage.getBucket(BUCKET);
  if (existing.data) {
    const updated = await admin.storage.updateBucket(BUCKET, options);
    if (updated.error) throw new Error(updated.error.message);
    return;
  }
  const created = await admin.storage.createBucket(BUCKET, options);
  if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
    throw new Error(created.error.message);
  }
}

function fileRow(row: {
  id: unknown;
  file_name: unknown;
  file_size: unknown;
  file_url: unknown;
  created_at: unknown;
}) {
  return {
    id: String(row.id),
    fileName: String(row.file_name),
    fileSize: Number(row.file_size),
    fileUrl: String(row.file_url),
    createdAt: String(row.created_at),
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const admin = await ownedAgent(id);
    if (!admin) return Response.json({ error: "Агент не найден." }, { status: 404 });
    const { data, error } = await admin
      .from("agent_knowledge_files")
      .select("id, file_name, file_size, file_url, created_at")
      .eq("agent_id", id)
      .order("created_at", { ascending: false });
    if (error) {
      if (migrationMissing(error.message)) {
        return Response.json({ error: "Примените миграцию 20261120_agent_knowledge_files.sql." }, { status: 503 });
      }
      throw new Error(error.message);
    }
    return Response.json({ files: (data ?? []).map(fileRow) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось загрузить файлы." }, { status: statusOf(error) });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const admin = await ownedAgent(id);
    if (!admin) return Response.json({ error: "Агент не найден." }, { status: 404 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Файл не передан." }, { status: 400 });
    const extension = extensionOf(file.name);
    if (!extension) return Response.json({ error: "Можно загрузить только PDF, DOCX, TXT, CSV и XLSX." }, { status: 400 });
    if (file.size <= 0) return Response.json({ error: "Файл пустой." }, { status: 400 });
    if (file.size > MAX_BYTES) return Response.json({ error: "Файл больше 10 МБ." }, { status: 400 });

    await ensureBucket();
    const fileName = displayFileName(file.name);
    const path = `${id}/${Date.now()}_${storageFileName(file.name, extension)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const upload = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: EXTENSIONS[extension],
      upsert: false,
    });
    if (upload.error) {
      const message = /invalid key/i.test(upload.error.message)
        ? "Имя файла не подошло для хранилища. Переименуйте файл латиницей и загрузите снова."
        : upload.error.message;
      throw new Error(message);
    }

    const { data, error } = await admin
      .from("agent_knowledge_files")
      .insert({ agent_id: id, file_name: fileName, file_size: file.size, file_url: path })
      .select("id, file_name, file_size, file_url, created_at")
      .single();
    if (error || !data) {
      await admin.storage.from(BUCKET).remove([path]);
      if (error && migrationMissing(error.message)) {
        return Response.json({ error: "Примените миграцию 20261120_agent_knowledge_files.sql." }, { status: 503 });
      }
      throw new Error(error?.message ?? "Не удалось сохранить файл.");
    }
    try {
      await indexKnowledgeFile({ agentId: id, fileId: String(data.id), extension, buffer });
    } catch (indexError) {
      await admin.from("agent_knowledge_files").delete().eq("id", data.id);
      await admin.storage.from(BUCKET).remove([path]);
      throw indexError;
    }
    return Response.json({ file: fileRow(data) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось загрузить файл." }, { status: statusOf(error) });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await connection();
  try {
    const { id } = await params;
    const admin = await ownedAgent(id);
    if (!admin) return Response.json({ error: "Агент не найден." }, { status: 404 });

    const fromQuery = new URL(request.url).searchParams.get("fileId") ?? "";
    let fileId = UUID_PATTERN.test(fromQuery) ? fromQuery : "";
    if (!fileId) {
      const body = (await request.json().catch(() => null)) as { file_id?: unknown; fileId?: unknown } | null;
      const candidate = typeof body?.file_id === "string" ? body.file_id : typeof body?.fileId === "string" ? body.fileId : "";
      if (UUID_PATTERN.test(candidate)) fileId = candidate;
    }
    if (!fileId) return Response.json({ error: "Файл не указан." }, { status: 400 });

    const { data, error } = await admin
      .from("agent_knowledge_files")
      .select("id, file_url")
      .eq("id", fileId)
      .eq("agent_id", id)
      .maybeSingle();
    if (error) {
      if (migrationMissing(error.message)) {
        return Response.json({ error: "Примените миграцию 20261120_agent_knowledge_files.sql." }, { status: 503 });
      }
      throw new Error(error.message);
    }
    if (!data) return Response.json({ error: "Файл не найден." }, { status: 404 });

    const path = objectPath(String(data.file_url));
    if (path.startsWith(`${id}/`)) {
      const removed = await admin.storage.from(BUCKET).remove([path]);
      if (removed.error) throw new Error(removed.error.message);
    }
    const chunks = await admin.from("knowledge_chunks").delete().eq("file_id", fileId).eq("agent_id", id);
    if (chunks.error && !/knowledge_chunks|schema cache/i.test(chunks.error.message)) throw new Error(chunks.error.message);
    const deleted = await admin.from("agent_knowledge_files").delete().eq("id", fileId).eq("agent_id", id);
    if (deleted.error) throw new Error(deleted.error.message);
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось удалить файл." }, { status: statusOf(error) });
  }
}
