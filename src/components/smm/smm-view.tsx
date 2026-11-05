"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Check, Link2, Loader2, Sparkles, TrendingUp, Video } from "lucide-react";

import { saveSmmAvatarId, saveSmmStrategy } from "@/app/actions/smm";
import { ChannelIcon } from "@/components/channel-icons";
import { VideoPanel } from "@/components/smm/video-panel";
import { toast } from "@/components/ui/toaster";
import type { SmmStrategyState } from "@/lib/smm-types";
import { cn } from "@/lib/utils";

/* Явные цвета: светлая тема портала строится инверсией переменных, white/zinc здесь не используем. */
export const CARD =
  "rounded-3xl border border-gray-200 bg-[#ffffff] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-12px_rgba(16,24,40,0.08)]";
export const INK = "text-[#0b0b0f]";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3 text-sm font-semibold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)] transition-all duration-200 hover:brightness-110 active:scale-[0.98]";
const BTN_OUTLINE =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-[#ffffff] px-5 py-3 text-sm font-semibold text-[#0b0b0f] transition-colors hover:border-rose-300 hover:bg-rose-50/50";
const INPUT =
  "w-full rounded-xl border border-gray-200 bg-[#ffffff] px-4 py-3 text-sm text-[#0b0b0f] outline-none transition-colors placeholder:text-gray-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100";
const LABEL = "text-xs font-semibold uppercase tracking-widest text-gray-500";

export function SectionTitle({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 className={cn("font-heading text-2xl font-bold tracking-tight", INK)}>{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">{text}</p>
      </div>
      {action}
    </div>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M13.5 22v-8.2h2.8l.5-3.3h-3.3V8.4c0-.95.46-1.88 1.95-1.88h1.5V3.7S15.6 3.5 14.3 3.5c-2.7 0-4.5 1.64-4.5 4.6v2.4H6.8v3.3h3V22h3.7Z" />
    </svg>
  );
}

/* ----------------------------- Подключения ----------------------------- */

export function ConnectionsTab() {
  const providers = [
    {
      id: "instagram",
      name: "Instagram",
      text: "Публикация постов, Reels и историй в бизнес-аккаунт Instagram.",
      icon: <ChannelIcon provider="instagram" className="size-7" />,
      perks: ["Посты и Reels", "Автопубликация по расписанию", "Статистика охватов"],
    },
    {
      id: "facebook",
      name: "Facebook",
      text: "Управление страницей: публикации, видео и кросспостинг из Instagram.",
      icon: <FacebookIcon className="size-7" />,
      perks: ["Публикации на страницу", "Видео и фото", "Кросспостинг"],
    },
  ];

  return (
    <div>
      <SectionTitle title="Подключения" text="Привяжите аккаунты через безопасный OAuth. Мы не храним ваши пароли." />
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {providers.map((provider) => (
          <div key={provider.id} className={cn(CARD, "flex flex-col p-6 sm:p-8")}>
            <div className="flex items-start justify-between gap-4">
              <span className="grid size-14 place-items-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-600">{provider.icon}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
                <span className="size-1.5 rounded-full bg-gray-400" />
                Не подключён
              </span>
            </div>
            <h3 className={cn("mt-6 font-heading text-2xl font-bold tracking-tight", INK)}>{provider.name}</h3>
            <p className="mt-2 text-sm leading-6 text-gray-500">{provider.text}</p>
            <ul className="mt-5 space-y-2">
              {provider.perks.map((perk) => (
                <li key={perk} className="flex items-center gap-2 text-sm text-gray-600">
                  <Check className="size-4 text-emerald-600" strokeWidth={2.5} />
                  {perk}
                </li>
              ))}
            </ul>
            <button type="button" className={cn(BTN_PRIMARY, "mt-8 w-full")}>
              <Link2 className="size-4" strokeWidth={2} />
              Подключить аккаунт
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------- Стратегия ------------------------------ */

const TONES = [
  { id: "friendly", label: "Дружелюбный" },
  { id: "expert", label: "Экспертный" },
  { id: "bold", label: "Дерзкий" },
  { id: "premium", label: "Премиальный" },
  { id: "playful", label: "Игривый" },
] as const;

const DAYS = [
  { id: "mon", label: "Пн" },
  { id: "tue", label: "Вт" },
  { id: "wed", label: "Ср" },
  { id: "thu", label: "Чт" },
  { id: "fri", label: "Пт" },
  { id: "sat", label: "Сб" },
  { id: "sun", label: "Вс" },
] as const;

function Spinner() {
  return <Loader2 className="size-4 animate-spin" strokeWidth={2} aria-hidden />;
}

export function StrategyTab({ projectId, initial }: { projectId: string; initial: SmmStrategyState }) {
  const [description, setDescription] = useState(initial.description);
  const [tone, setTone] = useState(initial.tone);
  const [days, setDays] = useState<string[]>(initial.days);
  const [time, setTime] = useState(initial.time);
  const [isSubmitting, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveSmmStrategy(projectId, { description, tone, days, time });
      if (result.ok) {
        toast.success("Стратегия сохранена");
      } else {
        toast.error(result.error);
      }
    });
  }

  function toggleDay(id: string) {
    setDays((current) => (current.includes(id) ? current.filter((day) => day !== id) : [...current, id]));
  }

  return (
    <div>
      <SectionTitle title="Стратегия" text="Расскажите о бизнесе: AI подберёт темы, стиль и частоту публикаций." />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,60fr)_minmax(0,40fr)]">
        <div className={cn(CARD, "space-y-6 p-6 sm:p-8")}>
          <div>
            <label htmlFor="smm-description" className={LABEL}>
              Описание бизнеса
            </label>
            <textarea
              id="smm-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={7}
              placeholder="Чем занимается компания, кто целевая аудитория, чем вы отличаетесь от конкурентов…"
              className={cn(INPUT, "mt-3 resize-y leading-6")}
            />
          </div>
          <div>
            <p className={LABEL}>Tone of Voice</p>
            <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Tone of Voice">
              {TONES.map((item) => {
                const selected = item.id === tone;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setTone(item.id)}
                    className={cn(
                      "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                      selected ? "border-rose-500 bg-rose-50 text-rose-900" : "border-gray-200 bg-[#ffffff] text-gray-700 hover:bg-gray-50",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={cn(CARD, "flex flex-col space-y-6 p-6 sm:p-8")}>
          <div>
            <p className={LABEL}>Расписание публикаций</p>
            <div className="mt-3 grid grid-cols-7 gap-1.5" role="group" aria-label="Дни недели">
              {DAYS.map((day) => {
                const selected = days.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleDay(day.id)}
                    className={cn(
                      "h-11 rounded-xl border text-sm font-semibold transition-colors",
                      selected ? "border-rose-500 bg-rose-50 text-rose-900" : "border-gray-200 bg-[#ffffff] text-gray-600 hover:bg-gray-50",
                    )}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label htmlFor="smm-time" className={LABEL}>
              Время публикации
            </label>
            <input id="smm-time" type="time" value={time} onChange={(event) => setTime(event.target.value)} className={cn(INPUT, "mt-3")} />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm leading-6 text-gray-600">
            <span className="font-semibold text-[#0b0b0f]">{days.length}</span> публикаций в неделю
            {days.length > 0 ? ` · в ${time}` : ""}.
          </div>
          <button type="button" onClick={save} disabled={isSubmitting} className={cn(BTN_PRIMARY, "mt-auto w-full disabled:opacity-70")}>
            {isSubmitting ? <Spinner /> : null}
            {isSubmitting ? "Сохраняем…" : "Сохранить стратегию"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- AI-Студия ------------------------------ */

export function StudioTab({ projectId, initialAvatarId, credits }: { projectId: string; initialAvatarId: string; credits: number }) {
  const [avatarId, setAvatarId] = useState(initialAvatarId);
  const [isSaving, startSaving] = useTransition();

  function saveAvatar() {
    startSaving(async () => {
      const result = await saveSmmAvatarId(projectId, avatarId);
      if (result.ok) {
        setAvatarId(result.avatarId);
        toast.success("ID аватара сохранён");
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div>
      <SectionTitle title="AI-Студия" text="Платформа генерирует видео на своих мощностях: подключать собственные API-ключи не нужно. Каждая генерация тратит один кредит." />
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,40fr)_minmax(0,60fr)]">
        <CreditsCard credits={credits} />
        <div className={cn(CARD, "flex flex-col p-6 sm:p-8")}>
          <div className="flex items-center gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-600">
              <Video className="size-5" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <h3 className={cn("font-heading text-lg font-bold tracking-tight", INK)}>Свой аватар HeyGen</h3>
              <p className="text-sm leading-5 text-gray-500">Необязательно: если не указан, используется аватар платформы.</p>
            </div>
          </div>
          <label htmlFor="avatar-id" className={cn(LABEL, "mt-6")}>
            ID аватара по умолчанию
          </label>
          <input
            id="avatar-id"
            type="text"
            autoComplete="off"
            value={avatarId}
            onChange={(event) => setAvatarId(event.target.value)}
            placeholder="Например, Anna_public_3_20240108"
            className={cn(INPUT, "mt-3")}
          />
          <button type="button" onClick={saveAvatar} disabled={isSaving} className={cn(BTN_OUTLINE, "mt-5 w-full disabled:opacity-70 sm:w-auto sm:self-start")}>
            {isSaving ? <Spinner /> : null}
            {isSaving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

const CREDITS_SCALE = 10;

function CreditsCard({ credits }: { credits: number }) {
  const low = credits <= 0;
  const fill = Math.min(100, Math.round((credits / CREDITS_SCALE) * 100));
  return (
    <div className={cn(CARD, "flex flex-col p-6 sm:p-8")}>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
        <Sparkles className="size-3.5" strokeWidth={2} />
        Лимиты тарифа
      </span>
      <p className={cn("mt-5 text-sm font-medium", low ? "text-rose-700" : "text-gray-500")}>Осталось генераций</p>
      <p className={cn("mt-1 font-heading text-6xl font-bold tracking-tight", low ? "text-rose-600" : INK)}>{credits}</p>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-strike transition-all duration-500" style={{ width: `${fill}%` }} />
      </div>
      <p className="mt-3 text-sm leading-6 text-gray-500">
        {low ? "Кредиты закончились. Улучшите тариф, чтобы продолжить создавать AI-видео." : "Новым клиентам доступно несколько тестовых генераций. Один ролик = один кредит."}
      </p>
      <button type="button" onClick={() => toast.success("Скоро: выбор тарифа появится в разделе «Биллинг»")} className={cn(BTN_PRIMARY, "mt-6 w-full")}>
        <TrendingUp className="size-4" strokeWidth={2} />
        Улучшить тариф
      </button>
    </div>
  );
}
/* ------------------------------ Контент-план ----------------------------- */

type PostStatus = "draft" | "scheduled" | "published";
const STATUS: Record<PostStatus, { label: string; className: string }> = {
  draft: { label: "Черновик", className: "border-gray-200 bg-gray-50 text-gray-600" },
  scheduled: { label: "Запланирован", className: "border-amber-200 bg-amber-50 text-amber-700" },
  published: { label: "Опубликован", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
};

const POSTS: { id: number; date: string; title: string; text: string; status: PostStatus; video?: boolean }[] = [
  { id: 1, date: "Пн, 10 ноя · 12:00", title: "5 ошибок при запуске рекламы", text: "Разбираем частые ошибки новичков и как их избежать. Сохраняйте, чтобы не потерять.", status: "scheduled", video: true },
  { id: 2, date: "Ср, 12 ноя · 12:00", title: "Кейс: заявки в 2 раза дешевле", text: "Как мы изменили креативы и сократили стоимость лида за две недели.", status: "scheduled" },
  { id: 3, date: "Пт, 14 ноя · 12:00", title: "За кулисами команды", text: "Показываем, как проходит рабочий день и как рождаются идеи для кампаний.", status: "draft", video: true },
  { id: 4, date: "Пн, 17 ноя · 12:00", title: "Чек-лист: подготовка к запуску", text: "Короткий список из семи пунктов, который экономит бюджет на старте.", status: "draft" },
  { id: 5, date: "Ср, 5 ноя · 12:00", title: "Новый тариф: что изменилось", text: "Рассказываем о новых возможностях и о том, кому они подойдут в первую очередь.", status: "published" },
  { id: 6, date: "Пт, 7 ноя · 12:00", title: "Ответы на частые вопросы", text: "Собрали самые популярные вопросы клиентов и дали на них честные ответы.", status: "published", video: true },
];

export function PlanTab({ projectId, initialCredits }: { projectId: string; initialCredits: number }) {
  const [credits, onCredits] = useState(initialCredits);
  return (
    <div>
      <SectionTitle
        title="Контент-план"
        text="Посты на месяц вперёд: текст, медиа и время публикации. Примеры ниже — заглушки."
        action={
          <button type="button" className={cn(BTN_PRIMARY, "w-full sm:w-auto")}>
            <Sparkles className="size-4" strokeWidth={2} />
            Сгенерировать контент на месяц
          </button>
        }
      />
      <ul className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {POSTS.map((post) => {
          const status = STATUS[post.status];
          return (
            <li key={post.id} className={cn(CARD, "flex flex-col p-6")}>
              <div className="grid aspect-video place-items-center rounded-2xl border border-gray-200 bg-gradient-to-br from-rose-50 to-gray-50 text-rose-300">
                {post.video ? <Video className="size-8" strokeWidth={1.5} /> : <Sparkles className="size-8" strokeWidth={1.5} />}
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
                <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", status.className)}>{status.label}</span>
                <span className="text-xs text-gray-400">{post.date}</span>
              </div>
              <h3 className={cn("mt-3 font-heading text-lg font-bold leading-snug tracking-tight", INK)}>{post.title}</h3>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-500">{post.text}</p>
              <div className="mt-auto">
                <VideoPanel projectId={projectId} defaultScript={post.text} credits={credits} onCredits={onCredits} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EmptySection({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <SectionTitle title={title} text={text} />
      <div className="mt-6 grid place-items-center rounded-3xl border border-dashed border-gray-200 bg-gray-50 px-6 py-20 text-center">
        <p className="text-sm text-gray-500">Раздел появится в одном из ближайших обновлений.</p>
      </div>
    </div>
  );
}
