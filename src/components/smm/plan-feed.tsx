"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { CalendarClock, CalendarDays, CheckCircle2, Clapperboard, Clock, Film, Lightbulb, Loader2, Pencil, Undo2, UserRound, Layers, FileText } from "lucide-react";

import { cancelScheduledPost, reschedulePost } from "@/app/actions/smm-plan";
import { ChannelBadges } from "@/components/smm/channel-badges";
import { CARD, INK, SectionTitle } from "@/components/smm/smm-view";
import { toast } from "@/components/ui/toaster";
import type { SmmPlanItem, SmmVideoFormat } from "@/lib/smm-strategy-types";
import { cn } from "@/lib/utils";

const BTN_SMALL =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-[#ffffff] px-3 py-1.5 text-xs font-semibold text-[#0b0b0f] transition-colors hover:border-rose-300 hover:bg-rose-50 disabled:opacity-50";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3 text-sm font-semibold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)] transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70";

const FORMAT_ICON: Record<SmmVideoFormat, typeof Film> = { avatar: UserRound, broll: Film, overlay: Layers, none: FileText };
const FORMAT_LABEL: Record<SmmVideoFormat, string> = { avatar: "Аватар", broll: "B-Roll", overlay: "Оверлей", none: "Текст" };

const subscribe = () => () => {};
function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date, now: Date) {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(date) === dayKey(now)) return "Сегодня";
  if (dayKey(date) === dayKey(tomorrow)) return "Завтра";
  if (dayKey(date) === dayKey(yesterday)) return "Вчера";
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) }).format(date);
}

const timeFormat = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" });

export function PlanFeed({ projectId, initialPosts }: { projectId: string; initialPosts: SmmPlanItem[] }) {
  const isClient = useIsClient();
  const [posts, setPosts] = useState(initialPosts);
  const [editing, setEditing] = useState<SmmPlanItem | null>(null);
  const [nowMs] = useState(() => Date.now());

  const groups = useMemo(() => {
    const now = new Date(nowMs);
    const map = new Map<string, { label: string; items: SmmPlanItem[] }>();
    for (const post of posts) {
      const date = post.scheduledTime ? new Date(post.scheduledTime) : null;
      const key = date ? dayKey(date) : "none";
      const group = map.get(key) ?? { label: date ? dayLabel(date, now) : "Без даты", items: [] };
      group.items.push(post);
      map.set(key, group);
    }
    return [...map.values()];
  }, [posts, nowMs]);

  const pending = posts.filter((post) => post.status === "ready").length;
  const published = posts.length - pending;

  if (posts.length === 0) {
    return (
      <div>
        <SectionTitle title="Контент-план" text="Расписание публикаций проекта." />
        <div className={cn(CARD, "mt-6 grid place-items-center px-6 py-20 text-center")}>
          <span className="grid size-16 place-items-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-600">
            <CalendarDays className="size-7" strokeWidth={1.75} />
          </span>
          <h3 className={cn("mt-6 font-heading text-2xl font-bold tracking-tight", INK)}>Контент-план пуст</h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">Запланируйте посты на вкладке «Идеи и стратегия» — они появятся здесь.</p>
          <Link href={`/smm/p/${projectId}/strategy`} className={cn(BTN_PRIMARY, "mt-8")}>
            <Lightbulb className="size-4" strokeWidth={2} />
            Перейти к идеям и стратегии
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SectionTitle
        title="Контент-план"
        text={`Ожидают публикации: ${pending} · Опубликовано: ${published}`}
        action={
          <Link href={`/smm/p/${projectId}/strategy`} className={BTN_SMALL}>
            <Lightbulb className="size-3.5" /> К доске идей
          </Link>
        }
      />

      {!isClient ? (
        <div className="mt-8 space-y-4" aria-hidden="true">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-40 animate-pulse rounded-3xl bg-gray-100" />
          ))}
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          {groups.map((group) => (
            <section key={group.label}>
              <h3 className="mb-4 flex items-center gap-3 font-heading text-lg font-bold tracking-tight text-[#0b0b0f]">
                <span className="size-2.5 rounded-full bg-strike" />
                {group.label}
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-600">{group.items.length}</span>
              </h3>
              <ul className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {group.items.map((post) => (
                  <PlanCard
                    key={post.id}
                    post={post}
                    projectId={projectId}
                    nowMs={nowMs}
                    onEdit={() => setEditing(post)}
                    onCancelled={(id) => setPosts((current) => current.filter((item) => item.id !== id))}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing ? (
        <RescheduleDialog
          post={editing}
          onClose={() => setEditing(null)}
          onSaved={(id, time) => {
            setPosts((current) => current.map((item) => (item.id === id ? { ...item, scheduledTime: time } : item)).sort(byTime));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function byTime(a: SmmPlanItem, b: SmmPlanItem) {
  return (a.scheduledTime ? Date.parse(a.scheduledTime) : Infinity) - (b.scheduledTime ? Date.parse(b.scheduledTime) : Infinity);
}

function PlanCard({ post, projectId, nowMs, onEdit, onCancelled }: { post: SmmPlanItem; projectId: string; nowMs: number; onEdit: () => void; onCancelled: (id: string) => void }) {
  const [pending, startTransition] = useTransition();
  const isReady = post.status === "ready";
  const date = post.scheduledTime ? new Date(post.scheduledTime) : null;
  const overdue = isReady && date !== null && date.getTime() < nowMs;
  const FormatIcon = FORMAT_ICON[post.videoFormat];
  const lines = post.content.split("\n").filter((line) => line.trim()).slice(0, 2).join("\n");

  function cancel() {
    if (!window.confirm("Снять пост с публикации? Он вернётся на доску в колонку «В работе».")) return;
    startTransition(async () => {
      const result = await cancelScheduledPost(post.id);
      if (result.ok) {
        onCancelled(post.id);
        toast.success("Пост снят с публикации и возвращён в «В работе»");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <li className={cn(CARD, "flex gap-4 p-5 transition-opacity", pending && "opacity-60")}>
      <div className="relative grid aspect-[9/16] w-20 shrink-0 place-items-center self-start overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-rose-50 to-gray-50 text-rose-300 sm:w-24">
        {post.mediaUrl ? (
          <video src={post.mediaUrl} muted playsInline preload="metadata" className="absolute inset-0 size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-1 text-center">
            <FormatIcon className="size-7" strokeWidth={1.5} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{post.videoFormat === "none" ? FORMAT_LABEL.none : "Рендер"}</span>
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-50 px-2.5 py-1 text-sm font-bold tabular-nums text-[#0b0b0f] ring-1 ring-gray-200">
            <Clock className="size-3.5 text-gray-500" strokeWidth={2.25} />
            {date ? timeFormat.format(date) : "—"}
          </span>
          {isReady ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              <CalendarClock className="size-3" /> Ожидает публикации
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="size-3" /> Опубликовано
            </span>
          )}
          {overdue ? <span className="text-xs font-medium text-rose-600">время прошло</span> : null}
        </div>

        <h4 className={cn("mt-3 line-clamp-2 font-heading text-base font-bold leading-snug", INK)}>{post.title || "Без названия"}</h4>
        {lines ? <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-sm leading-6 text-gray-500">{lines}</p> : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <ChannelBadges channels={post.channels} />
          {isReady ? (
            <div className="ml-auto flex flex-wrap gap-2">
              <button type="button" onClick={onEdit} disabled={pending} className={BTN_SMALL}>
                <Pencil className="size-3.5" /> Время
              </button>
              <button type="button" onClick={cancel} disabled={pending} className={cn(BTN_SMALL, "hover:border-rose-300")}>
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />} Снять с публикации
              </button>
            </div>
          ) : (
            <Link href={`/smm/p/${projectId}/studio?postId=${post.id}`} className={cn(BTN_SMALL, "ml-auto")}>
              <Clapperboard className="size-3.5" /> Открыть в студии
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function toLocalInput(value: string | null) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function RescheduleDialog({ post, onClose, onSaved }: { post: SmmPlanItem; onClose: () => void; onSaved: (id: string, time: string) => void }) {
  const [when, setWhen] = useState(() => toLocalInput(post.scheduledTime));
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

  function save() {
    const date = new Date(when);
    if (Number.isNaN(date.getTime())) return toast.error("Укажите дату и время.");
    startTransition(async () => {
      const result = await reschedulePost(post.id, date.toISOString());
      if (result.ok) {
        toast.success("Время публикации изменено");
        onSaved(post.id, result.scheduledTime);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#0b0b0f]/60 p-4" onMouseDown={() => !pending && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Изменить время публикации" onMouseDown={(event) => event.stopPropagation()} className="w-full max-w-md rounded-3xl border border-gray-200 bg-[#ffffff] p-6 shadow-2xl sm:p-8">
        <h3 className="font-heading text-2xl font-bold tracking-tight text-[#0b0b0f]">Новое время</h3>
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">{post.title}</p>
        <label htmlFor="resched" className="mt-6 block text-xs font-semibold uppercase tracking-widest text-gray-500">
          Дата и время публикации
        </label>
        <input
          id="resched"
          type="datetime-local"
          value={when}
          onChange={(event) => setWhen(event.target.value)}
          className="mt-3 w-full rounded-xl border border-gray-200 bg-[#ffffff] px-3.5 py-2.5 text-sm text-[#0b0b0f] outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
        />
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className="inline-flex items-center justify-center rounded-xl border border-gray-200 px-5 py-3 text-sm font-semibold text-[#0b0b0f] hover:bg-gray-50 disabled:opacity-50">
            Отмена
          </button>
          <button type="button" onClick={save} disabled={pending} className={BTN_PRIMARY}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}
            {pending ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
