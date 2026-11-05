"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Captions,
  Check,
  Clapperboard,
  Download,
  Film,
  Layers,
  Loader2,
  Mic,
  Sparkles,
  UploadCloud,
  UserRound,
  Wand2,
  X,
  Coins,
} from "lucide-react";

import { saveSmmAvatarId } from "@/app/actions/smm";
import { createStudioUploadUrl, generateStudioDraft, registerStudioUpload } from "@/app/actions/smm-studio";
import { checkVideoStatus, startVideoGeneration } from "@/app/actions/video";
import { toast } from "@/components/ui/toaster";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import {
  STUDIO_ASPECT_MAX,
  STUDIO_ASPECT_MIN,
  STUDIO_MAX_DURATION_SECONDS,
  STUDIO_MAX_UPLOAD_BYTES,
  STUDIO_UPLOAD_EXTENSIONS,
  type StudioPostData,
  type StudioStyle,
} from "@/lib/smm-studio-types";
import { describeStage, type VideoStatus } from "@/lib/video-types";
import { cn } from "@/lib/utils";

const CARD =
  "rounded-3xl border border-gray-200 bg-[#ffffff] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-12px_rgba(16,24,40,0.08)]";
const FIELD =
  "w-full rounded-xl border border-gray-200 bg-[#ffffff] px-4 py-3 text-sm leading-6 text-[#0b0b0f] outline-none transition-colors placeholder:text-gray-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 disabled:opacity-60";
const LABEL = "block text-xs font-semibold uppercase tracking-widest text-gray-500";
const BTN_PRIMARY =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3.5 text-sm font-semibold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";
const BTN_OUTLINE =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-[#ffffff] px-6 py-3 text-sm font-semibold text-[#0b0b0f] transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60";

const STYLES: { id: StudioStyle; title: string; text: string; icon: typeof UserRound }[] = [
  { id: "avatar", title: "Аватар", text: "AI-диктор в кадре", icon: UserRound },
  { id: "captions", title: "Титры", text: "Динамичные субтитры + опциональная озвучка", icon: Captions },
  { id: "overlay", title: "Оверлей", text: "Текстовая плашка + опциональная озвучка", icon: Layers },
];

const POLL_MS = 6000;
const MAX_POLL_ERRORS = 4;

type Upload = { name: string; previewUrl: string; publicUrl: string };

/** Проверка выбранного файла в браузере: тип, размер, вертикальность и длительность читаем из метаданных видео. */
function validateVideo(file: File): Promise<string | null> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!(STUDIO_UPLOAD_EXTENSIONS as readonly string[]).includes(extension)) return Promise.resolve("Допустимы только файлы .mp4 и .mov.");
  if (file.size > STUDIO_MAX_UPLOAD_BYTES) return Promise.resolve("Файл больше 50 МБ.");
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (message: string | null) => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(message);
    };
    const timer = setTimeout(() => finish("Не удалось прочитать видео: формат не поддерживается браузером."), 15_000);
    video.preload = "metadata";
    video.muted = true;
    video.onerror = () => {
      clearTimeout(timer);
      finish("Не удалось прочитать видео: формат не поддерживается браузером.");
    };
    video.onloadedmetadata = () => {
      clearTimeout(timer);
      const ratio = video.videoWidth / video.videoHeight;
      if (!Number.isFinite(video.duration) || video.duration > STUDIO_MAX_DURATION_SECONDS + 0.5) return finish("Видео длиннее 60 секунд.");
      if (!(ratio >= STUDIO_ASPECT_MIN && ratio <= STUDIO_ASPECT_MAX)) {
        return finish(`Нужно вертикальное видео 9:16. Ваш файл: ${video.videoWidth}×${video.videoHeight}.`);
      }
      finish(null);
    };
    video.src = url;
  });
}

export function StudioEditor({
  projectId,
  initialCredits,
  initialAvatarId,
  post,
  brand,
}: {
  projectId: string;
  initialCredits: number;
  initialAvatarId: string;
  post: StudioPostData | null;
  brand: { color: string; font: string };
}) {
  const [style, setStyle] = useState<StudioStyle>(post?.style ?? "captions");
  const [bgTab, setBgTab] = useState<"ai" | "upload">("ai");
  const [visualPrompt, setVisualPrompt] = useState(post?.visualPrompt ?? "");
  const [voiceover, setVoiceover] = useState(post?.voiceoverText ?? "");
  const [screenText, setScreenText] = useState(post?.style === "overlay" ? (post?.title ?? "") : "");
  const [upload, setUpload] = useState<Upload | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [draft, setDraft] = useState<{ audioUrl: string | null; imageUrl: string | null } | null>(null);
  const [isDrafting, startDrafting] = useTransition();
  const [credits, setCredits] = useState(initialCredits);
  const [avatarId, setAvatarId] = useState(initialAvatarId);
  const [avatarInput, setAvatarInput] = useState(initialAvatarId);
  const [savingAvatar, startSavingAvatar] = useTransition();
  const [isStarting, startRender] = useTransition();
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const errorsRef = useRef(0);
  const previewRef = useRef<string | null>(null);

  const completed = status?.status === "completed";
  const rendering = isStarting || (jobId !== null && !completed && failure === null);
  const stage = describeStage(status?.stage ?? "queued");
  const percent = completed ? 100 : stage.percent;
  const needsVoice = style === "avatar";

  useEffect(() => {
    previewRef.current = upload?.previewUrl ?? null;
  }, [upload]);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  useEffect(() => {
    if (!jobId || completed || failure !== null) return;
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
  }, [jobId, completed, failure]);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file || uploading) return;
      setUploadError(null);
      setUploading(true);
      try {
        const problem = await validateVideo(file);
        if (problem) {
          setUploadError(problem);
          return;
        }
        const signed = await createStudioUploadUrl(projectId, file.name, file.size);
        if (!signed.ok) {
          setUploadError(signed.error);
          return;
        }
        const { error } = await createSupabaseBrowserClient()
          .storage.from("smm_media")
          .uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type || "video/mp4" });
        if (error) {
          setUploadError(`Не удалось загрузить файл: ${error.message}`);
          return;
        }
        const registered = await registerStudioUpload(projectId, signed.path);
        if (!registered.ok) {
          setUploadError(registered.error);
          return;
        }
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        setUpload({ name: file.name, previewUrl: URL.createObjectURL(file), publicUrl: registered.url });
        toast.success("Фон загружен");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [projectId, uploading],
  );

  function makeDraft() {
    startDrafting(async () => {
      const result = await generateStudioDraft({ projectId, voiceoverText: voiceover, visualPrompt, useAiBackground: bgTab === "ai" });
      if (result.ok) {
        setDraft({ audioUrl: result.audioUrl, imageUrl: result.imageUrl });
        toast.success("Черновик готов");
      } else {
        toast.error(result.error);
      }
    });
  }

  function saveAvatar() {
    startSavingAvatar(async () => {
      const result = await saveSmmAvatarId(projectId, avatarInput);
      if (result.ok) {
        setAvatarId(result.avatarId);
        toast.success("Avatar ID сохранён");
      } else {
        toast.error(result.error);
      }
    });
  }

  function validateForRender(): string | null {
    if (needsVoice && !voiceover.trim()) return "Введите текст для озвучки.";
    if (!needsVoice && !voiceover.trim() && !screenText.trim()) return "Введите текст озвучки или текст на экран.";
    if (needsVoice && !avatarId) return "Укажите HeyGen Avatar ID.";
    if (!needsVoice && bgTab === "upload" && !upload) return "Загрузите видео-фон или переключитесь на AI-генерацию.";
    if (!needsVoice && bgTab === "ai" && !visualPrompt.trim()) return "Опишите видеоряд для AI-фона.";
    if (credits <= 0) return "Недостаточно кредитов.";
    return null;
  }

  function render() {
    const problem = validateForRender();
    if (problem) return toast.error(problem);
    startRender(async () => {
      const result = await startVideoGeneration(
        projectId,
        voiceover.trim() || screenText.trim(),
        needsVoice ? "avatar" : "broll",
        !needsVoice && bgTab === "ai" ? visualPrompt : undefined,
        {
          style,
          backgroundUrl: !needsVoice && bgTab === "upload" ? upload?.publicUrl : undefined,
          overlayText: needsVoice ? undefined : screenText,
          postId: post?.id,
        },
      );
      if (result.ok) {
        setCredits(result.credits);
        errorsRef.current = 0;
        setJobId(result.jobId);
        setStatus(null);
        setFailure(null);
        setDownloaded(false);
        toast.success(post ? "Генерация запущена, пост перенесён «В работу»" : "Генерация запущена");
      } else {
        toast.error(result.error);
      }
    });
  }

  function reset() {
    setJobId(null);
    setStatus(null);
    setFailure(null);
    setDownloaded(false);
  }

  // Чёрный (значение по умолчанию) на тёмном кадре не читается: для превью берём фирменный красный.
  const accent = brand.color.toLowerCase() === "#000000" ? "#cf0234" : brand.color;
  const previewText = (screenText.trim() || voiceover.trim()).slice(0, 90);
  const draftImage = bgTab === "ai" ? draft?.imageUrl : null;
  const uploadPreview = bgTab === "upload" ? upload?.previewUrl : null;

  return (
    <div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">AI-Видеостудия</p>
        <h2 className="mt-2 font-heading text-3xl font-bold tracking-tight text-[#0b0b0f]">Конструктор видео</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
          Выберите формат, фон и сценарий, прослушайте бесплатный черновик и запустите финальный рендер.
        </p>
      </div>

      {post ? (
        <div className="mt-6 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-6 text-rose-900">
            <span className="font-semibold">Видео для поста:</span> {post.title || "Без названия"}. Сценарий подставлен автоматически.
          </p>
          <Link href={`/smm/p/${projectId}/strategy`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700 hover:underline">
            <ArrowLeft className="size-4" /> К доске идей
          </Link>
        </div>
      ) : null}

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ------------------------------ Левая панель ------------------------------ */}
        <fieldset disabled={rendering} className={cn("min-w-0 space-y-6 transition-opacity", rendering && "opacity-60")}>
          <section className={cn(CARD, "p-6 sm:p-8")}>
            <h3 className="font-heading text-lg font-bold text-[#0b0b0f]">
              <span className="mr-2 text-strike">1.</span>Формат видео
            </h3>
            <div role="radiogroup" aria-label="Формат видео" className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {STYLES.map((item) => {
                const Icon = item.icon;
                const active = style === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStyle(item.id)}
                    className={cn(
                      "group relative flex flex-col items-start rounded-2xl border p-4 text-left transition-all duration-200",
                      active ? "border-rose-400 bg-rose-50 ring-2 ring-rose-100" : "border-gray-200 bg-[#ffffff] hover:-translate-y-0.5 hover:border-rose-300 hover:shadow-md",
                    )}
                  >
                    <span className={cn("grid size-10 place-items-center rounded-xl border", active ? "border-rose-200 bg-[#ffffff] text-rose-600" : "border-gray-200 bg-gray-50 text-gray-500 group-hover:text-rose-600")}>
                      <Icon className="size-5" strokeWidth={1.75} />
                    </span>
                    <span className="mt-3 text-sm font-bold text-[#0b0b0f]">{item.title}</span>
                    <span className="mt-1 text-xs leading-5 text-gray-500">{item.text}</span>
                    {active ? <Check className="absolute right-3 top-3 size-4 text-rose-600" strokeWidth={3} /> : null}
                  </button>
                );
              })}
            </div>

            {style === "avatar" ? (
              <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
                <label htmlFor="avatar-id" className={LABEL}>
                  HeyGen Avatar ID {avatarId ? <span className="ml-1 text-emerald-600">· сохранён</span> : null}
                </label>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input id="avatar-id" value={avatarInput} onChange={(event) => setAvatarInput(event.target.value)} placeholder="Например: Daisy-inskirt-20220818" className={FIELD} />
                  <button type="button" onClick={saveAvatar} disabled={savingAvatar || avatarInput.trim() === avatarId} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-[#ffffff] px-5 py-3 text-sm font-semibold text-[#0b0b0f] transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50">
                    {savingAvatar ? <Loader2 className="size-4 animate-spin" /> : null} Сохранить
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {style !== "avatar" ? (
            <section className={cn(CARD, "p-6 sm:p-8")}>
              <h3 className="font-heading text-lg font-bold text-[#0b0b0f]">
                <span className="mr-2 text-strike">2.</span>Исходник / фон
              </h3>
              <div role="tablist" aria-label="Источник фона" className="mt-5 inline-flex w-full gap-1 rounded-2xl border border-gray-200 bg-gray-50 p-1 sm:w-auto">
                {([
                  ["ai", "Сгенерировать AI", Wand2],
                  ["upload", "Загрузить своё", UploadCloud],
                ] as const).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={bgTab === id}
                    onClick={() => setBgTab(id)}
                    className={cn(
                      "inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all sm:flex-none",
                      bgTab === id ? "bg-[#ffffff] text-rose-700 shadow-sm ring-1 ring-gray-200" : "text-gray-500 hover:text-[#0b0b0f]",
                    )}
                  >
                    <Icon className="size-4" strokeWidth={2} />
                    {label}
                  </button>
                ))}
              </div>

              {bgTab === "ai" ? (
                <div className="mt-5">
                  <label htmlFor="visual" className={LABEL}>Описание видеоряда</label>
                  <textarea id="visual" rows={4} maxLength={1000} value={visualPrompt} onChange={(event) => setVisualPrompt(event.target.value)} placeholder="Например: неоновый ночной город, камера медленно приближается, кинематографичный свет" className={cn(FIELD, "mt-3 resize-y")} />
                </div>
              ) : (
                <div className="mt-5">
                  <input ref={fileRef} type="file" accept=".mp4,.mov,video/mp4,video/quicktime" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} />
                  {upload ? (
                    <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <video src={upload.previewUrl} muted playsInline className="h-20 w-[45px] shrink-0 rounded-lg bg-[#0b0b0f] object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-emerald-900">{upload.name}</p>
                        <p className="text-xs text-emerald-700">Загружено и готово к рендеру</p>
                      </div>
                      <button type="button" onClick={() => setUpload(null)} aria-label="Убрать файл" className="grid size-9 place-items-center rounded-xl border border-emerald-200 bg-[#ffffff] text-emerald-700 hover:bg-emerald-100">
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(event) => { event.preventDefault(); setDragOver(false); void handleFile(event.dataTransfer.files?.[0]); }}
                      disabled={uploading}
                      className={cn(
                        "flex w-full flex-col items-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200",
                        dragOver ? "border-rose-400 bg-rose-50" : "border-gray-300 bg-gray-50 hover:border-rose-300 hover:bg-rose-50/60",
                      )}
                    >
                      {uploading ? <Loader2 className="size-8 animate-spin text-rose-500" /> : <UploadCloud className="size-8 text-gray-400" strokeWidth={1.5} />}
                      <span className="mt-3 text-sm font-semibold text-[#0b0b0f]">{uploading ? "Проверяем и загружаем…" : "Перетащите видео сюда или нажмите, чтобы выбрать"}</span>
                      <span className="mt-1 text-xs text-gray-500">MP4 или MOV · вертикальное 9:16 · до 60 сек · до 50 МБ</span>
                    </button>
                  )}
                  {uploadError ? (
                    <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {uploadError}
                    </p>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}

          <section className={cn(CARD, "p-6 sm:p-8")}>
            <h3 className="font-heading text-lg font-bold text-[#0b0b0f]">
              <span className="mr-2 text-strike">{style === "avatar" ? 2 : 3}.</span>Сценарий
            </h3>
            <div className="mt-5 space-y-5">
              <div>
                <label htmlFor="voiceover" className={LABEL}>Текст для озвучки{needsVoice ? "" : " (необязательно)"}</label>
                <textarea id="voiceover" rows={5} maxLength={4000} value={voiceover} onChange={(event) => setVoiceover(event.target.value)} placeholder="Что скажет диктор: 15–30 секунд речи" className={cn(FIELD, "mt-3 resize-y")} />
              </div>
              {style !== "avatar" ? (
                <div>
                  <label htmlFor="screen" className={LABEL}>Текст на экран</label>
                  <textarea id="screen" rows={3} maxLength={300} value={screenText} onChange={(event) => setScreenText(event.target.value)} placeholder={style === "overlay" ? "Текст плашки: короткий и цепляющий" : "Ключевая фраза для титров"} className={cn(FIELD, "mt-3 resize-y")} />
                  {!voiceover.trim() && screenText.trim() ? <p className="mt-2 text-xs text-gray-500">Без текста озвучки видео будет озвучено текстом с экрана.</p> : null}
                </div>
              ) : null}
            </div>
          </section>
        </fieldset>

        {/* ------------------------------ Правая панель ----------------------------- */}
        <aside className="min-w-0 xl:sticky xl:top-6 xl:self-start">
          <div className={cn(CARD, "p-6 sm:p-8")}>
            <div className="mx-auto w-full max-w-[280px]">
              <div className="relative aspect-[9/16] overflow-hidden rounded-[2rem] border-[6px] border-[#0b0b0f] bg-[#0b0b0f] shadow-xl">
                {isDrafting ? (
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-b from-[#374151] to-[#111827]">
                    <div className="absolute inset-x-6 bottom-16 space-y-2">
                      <div className="h-3 rounded bg-[#ffffff]/20" />
                      <div className="h-3 w-2/3 rounded bg-[#ffffff]/20" />
                    </div>
                  </div>
                ) : uploadPreview ? (
                  <video key={uploadPreview} src={uploadPreview} autoPlay muted loop playsInline className="absolute inset-0 size-full object-cover" />
                ) : draftImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={draftImage} alt="Черновой кадр" className="absolute inset-0 size-full object-cover" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-[#1f2937] via-[#111827] to-[#000000] text-[#6b7280]">
                    {style === "avatar" ? <UserRound className="size-16" strokeWidth={1.25} /> : <Film className="size-14" strokeWidth={1.25} />}
                  </div>
                )}

                {style === "avatar" && !isDrafting ? (
                  <span className="absolute left-3 top-3 rounded-full bg-[#000000]/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#ffffff] backdrop-blur">AI-диктор в кадре</span>
                ) : null}
                {previewText && style === "overlay" && !isDrafting ? (
                  <div className="absolute inset-x-3 top-10 rounded-xl px-3 py-2 text-center text-sm font-bold leading-snug text-[#ffffff] shadow-lg" style={{ backgroundColor: accent, fontFamily: `"${brand.font}", sans-serif` }}>
                    {previewText}
                  </div>
                ) : null}
                {previewText && style !== "overlay" && !isDrafting ? (
                  <p className="absolute inset-x-3 bottom-14 text-center text-lg font-extrabold uppercase leading-tight text-[#ffffff] [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]" style={{ fontFamily: `"${brand.font}", sans-serif` }}>
                    <span style={{ color: "#facc15" }}>{previewText.split(" ").slice(0, 2).join(" ")}</span>{" "}
                    {previewText.split(" ").slice(2).join(" ")}
                  </p>
                ) : null}
              </div>
            </div>

            {draft?.audioUrl ? (
              <div className="mt-5">
                <p className={cn(LABEL, "mb-2 flex items-center gap-1.5")}><Mic className="size-3.5" /> Озвучка (черновик)</p>
                <audio controls src={draft.audioUrl} className="w-full" />
              </div>
            ) : null}

            <button type="button" onClick={makeDraft} disabled={isDrafting || rendering} className={cn(BTN_OUTLINE, "mt-6")}>
              {isDrafting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" strokeWidth={2} />}
              {isDrafting ? "Готовим черновик…" : "Сгенерировать черновик"}
              {!isDrafting ? <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">бесплатно</span> : null}
            </button>
            <p className="mt-2 text-center text-xs text-gray-400">Голос и статичный кадр. Озвучивается первые 600 символов.</p>

            <div className="mt-6 flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4">
              <span className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-rose-100 bg-rose-50 text-rose-600"><Coins className="size-5" strokeWidth={1.75} /></span>
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-widest text-gray-500">Баланс</span>
                  <span className="text-sm text-gray-500">видео-кредитов</span>
                </span>
              </span>
              <span className="font-heading text-3xl font-bold tabular-nums text-[#0b0b0f]">{credits}</span>
            </div>

            {completed ? (
              downloaded || status?.downloaded ? (
                <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">
                  Видео скачано
                  <button type="button" onClick={reset} className="ml-2 font-medium underline">Создать новое</button>
                </div>
              ) : (
                <a href={`/api/smm/video/${jobId}/download`} onClick={() => setDownloaded(true)} className={cn(BTN_PRIMARY, "mt-5")}>
                  <Download className="size-4" /> Скачать готовое видео
                </a>
              )
            ) : (
              <button type="button" onClick={failure ? reset : render} disabled={rendering || (!failure && credits <= 0)} className={cn(BTN_PRIMARY, "mt-5")}>
                {rendering ? <Loader2 className="size-4 animate-spin" /> : <Clapperboard className="size-4" strokeWidth={2} />}
                {rendering ? (isStarting ? "Запускаем…" : `Рендеринг (${percent}%)…`) : failure ? "Повторить" : "Списать 1 кредит и сгенерировать"}
              </button>
            )}
            {credits <= 0 && !jobId ? <p className="mt-2 text-center text-xs text-rose-600">Кредиты закончились. Пополните баланс.</p> : null}

            {rendering && jobId ? (
              <div className="mt-4" aria-live="polite">
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-strike transition-all duration-700" style={{ width: `${percent}%` }} />
                </div>
                <p className="mt-2 text-center text-xs text-gray-500">{stage.label}</p>
              </div>
            ) : null}
            {failure ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{failure}</p> : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
