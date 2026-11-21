"use client";

import { CloudUpload, FileText, Loader2, Trash } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { activeAccountHeader } from "@/lib/active-account";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(["pdf", "docx", "txt", "csv", "xlsx"]);
const DATE_FORMAT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" });

type KnowledgeFile = {
  id: string;
  fileName: string;
  fileSize: number;
  fileUrl: string;
  createdAt: string;
};

function accountHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra);
  const accountId = activeAccountHeader();
  if (accountId) headers.set("x-account-id", accountId);
  return headers;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date);
}

function rejectReason(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED.has(extension)) return "Можно загрузить только PDF, DOCX, TXT, CSV и XLSX.";
  if (file.size <= 0) return "Файл пустой.";
  if (file.size > MAX_BYTES) return "Файл больше 10 МБ.";
  return null;
}

export function AgentKnowledge({ agentId }: { agentId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<KnowledgeFile[]>([]);
  const [loading, setLoading] = useState(Boolean(agentId));
  const [dragging, setDragging] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/agents/${agentId}/knowledge`, { credentials: "same-origin", headers: accountHeaders() });
        const data = (await response.json().catch(() => null)) as { files?: KnowledgeFile[]; error?: string } | null;
        if (cancelled) return;
        if (!response.ok) {
          setError(data?.error || "Не удалось загрузить файлы.");
          setFiles([]);
          return;
        }
        setError(null);
        setFiles(data?.files ?? []);
      } catch {
        if (!cancelled) setError("Не удалось загрузить файлы.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  async function upload(list: File[]) {
    if (!agentId || uploadingName) return;
    for (const file of list) {
      const reason = rejectReason(file);
      if (reason) {
        toast.error(`${file.name}: ${reason}`);
        continue;
      }
      setUploadingName(file.name);
      try {
        const body = new FormData();
        body.set("file", file);
        const response = await fetch(`/api/agents/${agentId}/knowledge`, {
          method: "POST",
          credentials: "same-origin",
          headers: accountHeaders(),
          body,
        });
        const data = (await response.json().catch(() => null)) as { file?: KnowledgeFile; error?: string } | null;
        if (!response.ok || !data?.file) {
          toast.error(data?.error || "Не удалось загрузить файл.");
          continue;
        }
        setFiles((current) => [data.file!, ...current.filter((item) => item.id !== data.file!.id)]);
        setError(null);
        toast.success("Файл добавлен в базу знаний");
      } catch {
        toast.error("Не удалось загрузить файл.");
      } finally {
        setUploadingName(null);
      }
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(file: KnowledgeFile) {
    if (!agentId || deletingId) return;
    setDeletingId(file.id);
    try {
      const response = await fetch(`/api/agents/${agentId}/knowledge?fileId=${file.id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: accountHeaders(),
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        toast.error(data?.error || "Не удалось удалить файл.");
        return;
      }
      setFiles((current) => current.filter((item) => item.id !== file.id));
      toast.success("Файл удалён");
    } catch {
      toast.error("Не удалось удалить файл.");
    } finally {
      setDeletingId(null);
    }
  }

  if (!agentId) {
    return (
      <section className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-900 p-6 text-sm text-zinc-400">
        Сначала сохраните агента, затем сюда можно загрузить файлы базы знаний.
      </section>
    );
  }

  return (
    <section className="grid gap-5">
      <div>
        <h3 className="font-sans text-lg font-bold text-white">База знаний (Файлы)</h3>
        <p className="mt-1 text-sm text-zinc-400">PDF, DOCX, TXT, CSV и XLSX. Один файл не больше 10 МБ.</p>
      </div>

      <label
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (uploadingName) return;
          void upload([...event.dataTransfer.files]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-10 text-center transition-colors",
          dragging ? "border-strike bg-strike/10" : "border-zinc-700 bg-black hover:border-zinc-500",
          uploadingName && "pointer-events-none opacity-70",
        )}
      >
        <span className="grid size-11 place-items-center rounded-xl border border-zinc-800 bg-zinc-950 text-zinc-300">
          {uploadingName ? <Loader2 className="size-5 animate-spin" /> : <CloudUpload className="size-5" strokeWidth={1.75} />}
        </span>
        <span className="text-sm font-medium text-white">
          {uploadingName ? `Загружаем ${uploadingName}` : "Перетащите файлы или нажмите, чтобы выбрать"}
        </span>
        <span className="text-xs text-zinc-500">PDF, DOCX, TXT, CSV и XLSX · до 10 МБ</span>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.csv,.xlsx,application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          multiple
          className="sr-only"
          disabled={Boolean(uploadingName)}
          onChange={(event) => {
            const list = [...(event.target.files ?? [])];
            if (list.length) void upload(list);
          }}
        />
      </label>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {loading ? (
        <p className="inline-flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="size-4 animate-spin" />
          Загружаем список
        </p>
      ) : files.length === 0 ? (
        <p className="text-center text-sm text-zinc-500">Файлов пока нет</p>
      ) : (
        <ul className="grid gap-2">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-black px-3 py-2.5">
              <FileText className="size-4 shrink-0 text-zinc-400" strokeWidth={1.75} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{file.fileName}</p>
                <p className="text-xs text-zinc-500">
                  {formatSize(file.fileSize)} · {formatDate(file.createdAt)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Удалить ${file.fileName}`}
                disabled={deletingId === file.id}
                onClick={() => void remove(file)}
              >
                {deletingId === file.id ? <Loader2 className="size-4 animate-spin" /> : <Trash className="size-4" />}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
