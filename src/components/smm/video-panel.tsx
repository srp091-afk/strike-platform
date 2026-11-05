"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Clapperboard, Download, Loader2, Sparkles, Video, X } from "lucide-react";

import { checkVideoStatus, startVideoGeneration } from "@/app/actions/video";
import { toast } from "@/components/ui/toaster";
import { describeStage, type VideoMode, type VideoStatus } from "@/lib/video-types";
import { cn } from "@/lib/utils";

const POLL_MS = 6000;
const MAX_POLL_ERRORS = 4;

const BTN_PRIMARY =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-strike px-4 py-2.5 text-sm font-semibold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-80";
const INPUT =
  "w-full rounded-xl border border-gray-200 bg-[#ffffff] px-4 py-3 text-sm text-[#0b0b0f] outline-none transition-colors placeholder:text-gray-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100";

const MODES: Array<{ value: VideoMode; label: string; hint: string; icon: typeof Video }> = [
  { value: "avatar", label: "Аватар", hint: "HeyGen: говорящий AI-аватар", icon: Video },
  { value: "broll", label: "B-Roll", hint: "RunwayML: видеоряд под озвучку", icon: Clapperboard },
];

/** Кнопка «Сгенерировать AI-Reels» с диалогом сценария, опросом статуса и скачиванием результата. */
export function VideoPanel({
  projectId,
  defaultScript,
  credits,
  onCredits,
}: {
  projectId: string;
  defaultScript: string;
  credits: number;
  onCredits: (credits: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [downloadClicked, setDownloadClicked] = useState(false);
  const errorsRef = useRef(0);

  const isGenerating = jobId !== null && status?.status !== "completed" && failure === null;
  const stage = describeStage(status?.stage ?? "queued");
  const percent = status?.status === "completed" ? 100 : stage.percent;

  useEffect(() => {
    if (!jobId || !isGenerating) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const result = await checkVideoStatus(jobId as string);
      if (cancelled) return;
      if (!result.ok) {
        errorsRef.current += 1;
        if (errorsRef.current >= MAX_POLL_ERRORS) {
          setFailure(result.error);
          toast.error(result.error);
          return;
        }
      } else {
        errorsRef.current = 0;
        setStatus(result.status);
        if (result.status.status === "failed") {
          const message = result.status.errorMessage ?? "Не удалось создать видео.";
          setFailure(message);
          toast.error(message);
          return;
        }
        if (result.status.status === "completed") {
          toast.success("Видео готово");
          return;
        }
      }
      timer = setTimeout(poll, POLL_MS);
    }

    timer = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId, isGenerating]);

  function started(id: string, remaining: number) {
    onCredits(remaining);
    errorsRef.current = 0;
    setJobId(id);
    setStatus(null);
    setFailure(null);
    setDownloadClicked(false);
    setOpen(false);
  }

  function reset() {
    setJobId(null);
    setStatus(null);
    setFailure(null);
    setDownloadClicked(false);
  }

  const completed = status?.status === "completed";

  return (
    <div className="mt-5">
      {completed ? (
        status?.downloaded || downloadClicked ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-center text-sm font-semibold text-emerald-700">
            Видео скачано
            <button type="button" onClick={reset} className="ml-2 font-medium text-emerald-800 underline">
              Создать новое
            </button>
          </div>
        ) : (
          <a
            href={`/api/smm/video/${jobId}/download`}
            onClick={() => setDownloadClicked(true)}
            className={BTN_PRIMARY}
          >
            <Download className="size-4" strokeWidth={2} />
            Скачать готовое видео
          </a>
        )
      ) : (
        <button type="button" disabled={isGenerating} onClick={() => (failure ? reset() : setOpen(true))} className={BTN_PRIMARY}>
          {isGenerating ? <Loader2 className="size-4 animate-spin" strokeWidth={2} /> : <Sparkles className="size-4" strokeWidth={2} />}
          {isGenerating ? `Рендеринг (${percent}%)…` : failure ? "Повторить" : "Сгенерировать AI-Reels"}
        </button>
      )}

      {isGenerating ? (
        <div className="mt-3" aria-live="polite">
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-strike transition-all duration-700" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-center text-xs text-gray-500">{stage.label}</p>
        </div>
      ) : null}
      {failure ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{failure}</p> : null}
      {completed && !(status?.downloaded || downloadClicked) ? (
        <p className="mt-2 text-center text-xs text-gray-400">Файл можно скачать один раз: после скачивания движок удаляет его.</p>
      ) : null}

      {!isGenerating && !completed ? (
        <p className={cn("mt-2 text-center text-xs", credits > 0 ? "text-gray-400" : "text-rose-600")}>
          {credits > 0 ? `Осталось генераций: ${credits}` : "Кредиты закончились: улучшите тариф"}
        </p>
      ) : null}

      {open ? <VideoDialog projectId={projectId} defaultScript={defaultScript} onClose={() => setOpen(false)} onStarted={started} /> : null}
    </div>
  );
}

function VideoDialog({
  projectId,
  defaultScript,
  onClose,
  onStarted,
}: {
  projectId: string;
  defaultScript: string;
  onClose: () => void;
  onStarted: (jobId: string, credits: number) => void;
}) {
  const [text, setText] = useState(defaultScript);
  const [mode, setMode] = useState<VideoMode>("avatar");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !pending) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, pending]);

  function submit() {
    startTransition(async () => {
      const result = await startVideoGeneration(projectId, text, mode, videoPrompt);
      if (result.ok) {
        toast.success(`Рендеринг запущен. Осталось генераций: ${result.credits}`);
        onStarted(result.jobId, result.credits);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#0b0b0f]/60 p-4" onMouseDown={() => !pending && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-gray-200 bg-[#ffffff] p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 id="video-dialog-title" className="font-heading text-2xl font-bold tracking-tight text-[#0b0b0f]">
              AI-Reels
            </h3>
            <p className="mt-1 text-sm leading-6 text-gray-500">Введите сценарий: он будет озвучен и превращён в вертикальное видео.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Закрыть"
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <label htmlFor="video-script" className="mt-6 block text-xs font-semibold uppercase tracking-widest text-gray-500">
          Сценарий ролика
        </label>
        <textarea
          id="video-script"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          maxLength={4000}
          placeholder="Привет! Сегодня расскажу, как автоматизировать ответы клиентам за 5 минут…"
          className={cn(INPUT, "mt-3 resize-y leading-6")}
        />

        <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-gray-500">Режим</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Режим видео">
          {MODES.map((item) => {
            const Icon = item.icon;
            const selected = mode === item.value;
            return (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(item.value)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
                  selected ? "border-rose-500 bg-rose-50" : "border-gray-200 bg-[#ffffff] hover:bg-gray-50",
                )}
              >
                <Icon className={cn("mt-0.5 size-5 shrink-0", selected ? "text-rose-600" : "text-gray-400")} strokeWidth={2} />
                <span>
                  <span className={cn("block text-sm font-semibold", selected ? "text-rose-900" : "text-[#0b0b0f]")}>{item.label}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-gray-500">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {mode === "broll" ? (
          <>
            <label htmlFor="video-prompt" className="mt-5 block text-xs font-semibold uppercase tracking-widest text-gray-500">
              Описание видеоряда (необязательно)
            </label>
            <textarea
              id="video-prompt"
              value={videoPrompt}
              onChange={(event) => setVideoPrompt(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Например: уютный офис, команда обсуждает запуск рекламной кампании"
              className={cn(INPUT, "mt-3 resize-y leading-6")}
            />
          </>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-xl border border-gray-200 bg-[#ffffff] px-5 py-3 text-sm font-semibold text-[#0b0b0f] transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !text.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3 text-sm font-semibold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} /> : <Sparkles className="size-4" strokeWidth={2} />}
            {pending ? "Запускаем…" : "Запустить рендеринг"}
          </button>
        </div>
      </div>
    </div>
  );
}
