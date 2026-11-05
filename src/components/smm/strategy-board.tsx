"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Camera, ChevronLeft, ChevronRight, Clapperboard, Loader2, Mic, Pencil, Sparkles, Trash2, X, CalendarClock } from "lucide-react";

import {
  deletePost,
  generateStrategyAction,
  schedulePost,
  updatePostContent,
  updatePostStatus,
} from "@/app/actions/smm-strategy";
import { CARD, INK, SectionTitle } from "@/components/smm/smm-view";
import { toast } from "@/components/ui/toaster";
import {
  SMM_CHANNELS,
  SMM_PERIODS,
  SMM_VIDEO_FORMATS,
  type SmmIdea,
  type SmmIdeaStatus,
  type SmmPeriod,
  type SmmVideoFormat,
} from "@/lib/smm-strategy-types";
import { cn } from "@/lib/utils";

const FIELD =
  "w-full rounded-xl border border-gray-200 bg-[#ffffff] px-3.5 py-2.5 text-sm text-[#0b0b0f] outline-none transition-colors placeholder:text-gray-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 disabled:opacity-60";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3 text-sm font-semibold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70";
const BTN_SMALL =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-[#ffffff] px-3 py-1.5 text-xs font-semibold text-[#0b0b0f] transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50";

const FORMAT_BADGE: Record<SmmVideoFormat, { label: string; className: string }> = {
  avatar: { label: "Аватар", className: "border-violet-200 bg-violet-50 text-violet-700" },
  broll: { label: "B-Roll", className: "border-sky-200 bg-sky-50 text-sky-700" },
  overlay: { label: "Титры / Оверлей", className: "border-teal-200 bg-teal-50 text-teal-700" },
  none: { label: "Текст", className: "border-gray-200 bg-gray-50 text-gray-600" },
};

const COLUMNS: { id: Extract<SmmIdeaStatus, "idea" | "in_progress" | "ready">; title: string }[] = [
  { id: "idea", title: "Новые идеи" },
  { id: "in_progress", title: "В работе" },
  { id: "ready", title: "Готово к публикации" },
];

export function StrategyBoard({ projectId, initialIdeas }: { projectId: string; initialIdeas: SmmIdea[] }) {
  const [ideas, setIdeas] = useState(initialIdeas);
  const [period, setPeriod] = useState<SmmPeriod>("week");
  const [videoRatio, setVideoRatio] = useState(70);
  const [topic, setTopic] = useState("");
  const [isGenerating, startGenerating] = useTransition();
  const [scheduling, setScheduling] = useState<SmmIdea | null>(null);

  function generate() {
    if (isGenerating) return;
    startGenerating(async () => {
      const result = await generateStrategyAction({ projectId, period, videoRatio, topic });
      if (result.ok) {
        setIdeas((current) => [...result.ideas, ...current]);
        toast.success(`Добавлено идей: ${result.ideas.length}`);
      } else {
        toast.error(result.error);
      }
    });
  }

  function patch(idea: SmmIdea) {
    setIdeas((current) => current.map((item) => (item.id === idea.id ? idea : item)));
  }

  return (
    <div>
      <SectionTitle title="Идеи и стратегия" text="Генерация постов и сценариев с учётом голоса бренда и аудитории. Двигайте карточки по этапам работы." />

      <section className={cn(CARD, "mt-6 p-6 sm:p-8")}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Период</p>
            <div role="radiogroup" aria-label="Период" className="mt-3 flex flex-wrap gap-1 rounded-2xl border border-gray-200 bg-gray-50 p-1">
              {(Object.keys(SMM_PERIODS) as SmmPeriod[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={period === key}
                  disabled={isGenerating}
                  onClick={() => setPeriod(key)}
                  className={cn(
                    "flex-1 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-all disabled:opacity-60",
                    period === key ? "bg-[#ffffff] text-rose-700 shadow-sm ring-1 ring-gray-200" : "text-gray-500 hover:text-[#0b0b0f]",
                  )}
                >
                  {SMM_PERIODS[key].label} ({SMM_PERIODS[key].count} {key === "day" ? "поста" : "постов"})
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="ratio" className="flex items-center justify-between text-xs font-semibold uppercase tracking-widest text-gray-500">
              <span>Доля видео</span>
              <span className="text-[#0b0b0f]">
                {videoRatio}% видео · {100 - videoRatio}% текст
              </span>
            </label>
            <input
              id="ratio"
              type="range"
              min={0}
              max={100}
              step={10}
              value={videoRatio}
              disabled={isGenerating}
              onChange={(event) => setVideoRatio(Number(event.target.value))}
              className="mt-5 w-full accent-[#cf0234]"
            />
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            value={topic}
            disabled={isGenerating}
            maxLength={300}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="Например: Запуск нового курса или экспертные советы"
            className={cn(FIELD, "py-3")}
          />
          <button type="button" onClick={generate} disabled={isGenerating} className={cn(BTN_PRIMARY, "shrink-0")}>
            {isGenerating ? <Loader2 className="size-4 animate-spin" strokeWidth={2} /> : <Sparkles className="size-4" strokeWidth={2} />}
            {isGenerating ? "Генерируем…" : "Сгенерировать идеи и сценарии"}
          </button>
        </div>
      </section>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {COLUMNS.map((column) => {
          const items = ideas.filter((idea) => idea.status === column.id);
          return (
            <section key={column.id} className="rounded-3xl border border-gray-200 bg-gray-50 p-4">
              <header className="mb-4 flex items-center justify-between px-1">
                <h3 className={cn("font-heading text-base font-bold tracking-tight", INK)}>{column.title}</h3>
                <span className="rounded-full border border-gray-200 bg-[#ffffff] px-2.5 py-0.5 text-xs font-semibold text-gray-600">{items.length}</span>
              </header>
              <ul className="space-y-4">
                {items.length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-400">Пусто</li>
                ) : (
                  items.map((idea) => (
                    <IdeaCard
                      key={idea.id}
                      idea={idea}
                      projectId={projectId}
                      onChange={patch}
                      onRemove={(id) => setIdeas((current) => current.filter((item) => item.id !== id))}
                      onSchedule={() => setScheduling(idea)}
                    />
                  ))
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {scheduling ? (
        <ScheduleDialog
          idea={scheduling}
          onClose={() => setScheduling(null)}
          onSaved={(idea) => {
            patch(idea);
            setScheduling(null);
          }}
        />
      ) : null}
    </div>
  );
}

function IdeaCard({
  idea,
  projectId,
  onChange,
  onRemove,
  onSchedule,
}: {
  idea: SmmIdea;
  projectId: string;
  onChange: (idea: SmmIdea) => void;
  onRemove: (id: string) => void;
  onSchedule: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState(idea);
  const [pending, startTransition] = useTransition();
  const badge = FORMAT_BADGE[idea.videoFormat];
  const index = COLUMNS.findIndex((column) => column.id === idea.status);

  function move(direction: -1 | 1) {
    const target = COLUMNS[index + direction];
    if (!target) return;
    startTransition(async () => {
      const result = await updatePostStatus(idea.id, target.id);
      if (result.ok) onChange({ ...idea, status: target.id });
      else toast.error(result.error);
    });
  }

  function remove() {
    if (!window.confirm("Удалить этот пост?")) return;
    startTransition(async () => {
      const result = await deletePost(idea.id);
      if (result.ok) onRemove(idea.id);
      else toast.error(result.error);
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updatePostContent(idea.id, {
        title: draft.title,
        content: draft.content,
        videoFormat: draft.videoFormat,
        voiceoverText: draft.voiceoverText,
        visualPrompt: draft.visualPrompt,
      });
      if (result.ok) {
        onChange({ ...result.idea });
        setEditing(false);
        toast.success("Изменения сохранены");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <li className={cn(CARD, "p-5", pending && "opacity-70")}>
      {editing ? (
        <div className="space-y-3">
          <select
            value={draft.videoFormat}
            onChange={(event) => setDraft({ ...draft, videoFormat: event.target.value as SmmVideoFormat })}
            aria-label="Формат"
            className={FIELD}
          >
            {SMM_VIDEO_FORMATS.map((format) => (
              <option key={format} value={format}>
                {FORMAT_BADGE[format].label}
              </option>
            ))}
          </select>
          <input value={draft.title} maxLength={200} onChange={(event) => setDraft({ ...draft, title: event.target.value })} aria-label="Заголовок" className={cn(FIELD, "font-semibold")} />
          <textarea value={draft.content} rows={6} maxLength={4000} onChange={(event) => setDraft({ ...draft, content: event.target.value })} aria-label="Текст поста" className={cn(FIELD, "resize-y leading-6")} />
          {draft.videoFormat !== "none" ? (
            <>
              <textarea value={draft.voiceoverText} rows={3} maxLength={2000} onChange={(event) => setDraft({ ...draft, voiceoverText: event.target.value })} placeholder="Текст озвучки" aria-label="Текст озвучки" className={cn(FIELD, "resize-y leading-6")} />
              <textarea value={draft.visualPrompt} rows={3} maxLength={2000} onChange={(event) => setDraft({ ...draft, visualPrompt: event.target.value })} placeholder="Промпт для видеоряда" aria-label="Промпт для видеоряда" className={cn(FIELD, "resize-y leading-6")} />
            </>
          ) : null}
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SMALL} disabled={pending} onClick={() => { setDraft(idea); setEditing(false); }}>
              <X className="size-3.5" /> Отмена
            </button>
            <button type="button" className={cn(BTN_SMALL, "border-transparent bg-strike text-[#ffffff] hover:bg-strike hover:brightness-110")} disabled={pending} onClick={save}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null} Сохранить
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between gap-2">
            <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", badge.className)}>{badge.label}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => { setDraft(idea); setEditing(true); }} aria-label="Редактировать" className="grid size-8 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#0b0b0f]">
                <Pencil className="size-4" />
              </button>
              <button type="button" onClick={remove} disabled={pending} aria-label="Удалить" className="grid size-8 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-700">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
          <h4 className={cn("mt-3 font-heading text-base font-bold leading-snug", INK)}>{idea.title}</h4>
          <p className={cn("mt-2 whitespace-pre-line text-sm leading-6 text-gray-600", !expanded && "line-clamp-3")}>{idea.content}</p>
          {idea.content.length > 140 ? (
            <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-1 text-xs font-semibold text-rose-700 hover:underline">
              {expanded ? "Свернуть" : "Показать полностью"}
            </button>
          ) : null}

          {idea.videoFormat !== "none" && (idea.voiceoverText || idea.visualPrompt) ? (
            <div className="mt-4 space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">Сценарий видео</p>
              {idea.voiceoverText ? (
                <p className="flex gap-2 text-sm leading-6 text-gray-700">
                  <Mic className="mt-1 size-4 shrink-0 text-violet-600" strokeWidth={2} />
                  <span className={cn(!expanded && "line-clamp-3")}>{idea.voiceoverText}</span>
                </p>
              ) : null}
              {idea.visualPrompt ? (
                <p className="flex gap-2 text-sm leading-6 text-gray-700">
                  <Camera className="mt-1 size-4 shrink-0 text-sky-600" strokeWidth={2} />
                  <span className={cn(!expanded && "line-clamp-3")}>{idea.visualPrompt}</span>
                </p>
              ) : null}
            </div>
          ) : null}

          {idea.status === "ready" && idea.scheduledTime ? (
            <p className="mt-4 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
              <CalendarClock className="size-4 text-emerald-600" />
              {new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(idea.scheduledTime))}
              {idea.channels.length ? ` · ${idea.channels.map((id) => SMM_CHANNELS.find((channel) => channel.id === id)?.label ?? id).join(", ")}` : ""}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {idea.videoFormat !== "none" ? (
              <Link href={`/smm/p/${projectId}/studio?postId=${idea.id}`} className={BTN_SMALL}>
                <Clapperboard className="size-3.5" /> Создать видео
              </Link>
            ) : null}
            <button type="button" className={BTN_SMALL} onClick={onSchedule} disabled={pending}>
              <CalendarClock className="size-3.5" /> {idea.status === "ready" ? "Перенести" : "Запланировать"}
            </button>
            <div className="ml-auto flex gap-1">
              <button type="button" onClick={() => move(-1)} disabled={pending || index <= 0} aria-label="Назад" className={cn(BTN_SMALL, "px-2")}>
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" onClick={() => move(1)} disabled={pending || index >= COLUMNS.length - 1} aria-label="Дальше" className={cn(BTN_SMALL, "px-2")}>
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </li>
  );
}

function toLocalInput(value: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function ScheduleDialog({ idea, onClose, onSaved }: { idea: SmmIdea; onClose: () => void; onSaved: (idea: SmmIdea) => void }) {
  const [when, setWhen] = useState(() => toLocalInput(idea.scheduledTime));
  const [channels, setChannels] = useState<string[]>(idea.channels);
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

  function toggle(id: string) {
    setChannels((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function save() {
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return toast.error("Укажите дату и время.");
    if (channels.length === 0) return toast.error("Выберите хотя бы одну соцсеть.");
    startTransition(async () => {
      const result = await schedulePost(idea.id, date.toISOString(), channels);
      if (result.ok) {
        toast.success("Пост запланирован");
        onSaved(result.idea);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#0b0b0f]/60 p-4" onMouseDown={() => !pending && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Запланировать публикацию" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-3xl border border-gray-200 bg-[#ffffff] p-6 shadow-2xl sm:p-8">
        <h3 className="font-heading text-2xl font-bold tracking-tight text-[#0b0b0f]">Запланировать</h3>
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">{idea.title}</p>

        <label htmlFor="when" className="mt-6 block text-xs font-semibold uppercase tracking-widest text-gray-500">
          Дата и время
        </label>
        <input id="when" type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className={cn(FIELD, "mt-3")} />

        <p className="mt-6 text-xs font-semibold uppercase tracking-widest text-gray-500">Соцсети</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SMM_CHANNELS.map((channel) => (
            <label key={channel.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors", channels.includes(channel.id) ? "border-rose-300 bg-rose-50 text-rose-800" : "border-gray-200 text-gray-700 hover:bg-gray-50")}>
              <input type="checkbox" checked={channels.includes(channel.id)} onChange={() => toggle(channel.id)} className="size-4 accent-[#cf0234]" />
              {channel.label}
            </label>
          ))}
        </div>

        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-[#0b0b0f] hover:bg-gray-50 disabled:opacity-50">
            Отмена
          </button>
          <button type="button" onClick={save} disabled={pending} className={BTN_PRIMARY}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
            {pending ? "Сохраняем…" : "Запланировать"}
          </button>
        </div>
      </div>
    </div>
  );
}
