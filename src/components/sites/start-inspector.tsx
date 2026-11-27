"use client";

import { useRef, useState, type ReactNode } from "react";
import { FileUp, ImagePlus, Loader2, Sparkles, Trash2, Upload } from "lucide-react";

import { StudioSelect, StudioToggle } from "@/components/sites/studio-controls";
import { stripMarkers } from "@/lib/sites/quiz-polish";

import type { DeliveryChannel, GiftType, QuizGift, QuizSchema, StartLayout, ThemePreset } from "@/lib/sites/quiz-schema";

const field = "h-10 w-full rounded-xl border border-[#e4e4e7] bg-[#fff] px-3 text-sm text-[#09090b] outline-none";

const BULLET_ICONS = [
  ["check", "Галочка"],
  ["clock", "Срок"],
  ["home", "Объект"],
  ["map", "Место"],
  ["shield", "Защита"],
  ["star", "Оценка"],
  ["wallet", "Бюджет"],
] as const;

const LAYOUTS: { id: StartLayout; label: string }[] = [
  { id: "cinematic_hero", label: "Cinematic Hero" },
  { id: "editorial_split", label: "Editorial Split" },
  { id: "spotlight_center", label: "Spotlight Center" },
  { id: "swiss_minimal", label: "Swiss Minimal" },
];

export function StartInspector({
  siteId,
  title,
  preset,
  draft,
  focus,
  onChange,
}: {
  siteId: string;
  title: string;
  preset: ThemePreset;
  draft: QuizSchema;
  focus?: "gifts" | "start";
  onChange: (draft: QuizSchema) => void;
}) {
  const start = draft.startScreen;
  const headlineRef = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [wish, setWish] = useState("");

  function patch(next: Partial<QuizSchema["startScreen"]>) {
    onChange({ ...draft, startScreen: { ...start, ...next } });
  }

  async function improve() {
    setBusy("ai");
    setError("");
    const response = await fetch("/api/sites/improve-start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, startScreen: start, giftsConfig: draft.giftsConfig }),
    });
    const body = (await response.json()) as { startScreen?: QuizSchema["startScreen"]; giftsConfig?: QuizSchema["giftsConfig"]; error?: string };
    setBusy("");
    if (!response.ok || !body.startScreen || !body.giftsConfig) {
      setError(body.error || "Не удалось улучшить текст.");
      return;
    }
      onChange({
        ...draft,
        startScreen: { ...start, ...body.startScreen, media: start.media, brand: start.brand, layout: start.layout },
        giftsConfig: {
          ...body.giftsConfig,
          deliveryChannel: draft.giftsConfig.deliveryChannel,
          messengerUrl: draft.giftsConfig.messengerUrl ?? null,
          emailNote: draft.giftsConfig.emailNote ?? null,
          items: body.giftsConfig.items.map((item, index) => ({
            ...item,
            fileUrl: draft.giftsConfig.items[index]?.fileUrl ?? null,
            fileName: draft.giftsConfig.items[index]?.fileName ?? null,
            coverUrl: draft.giftsConfig.items[index]?.coverUrl ?? null,
            actionUrl: item.type === "link" ? item.actionUrl : draft.giftsConfig.items[index]?.actionUrl ?? null,
          })),
        },
      });
  }

  async function generateBackground() {
    setBusy("hero_ai");
    setError("");
    const response = await fetch("/api/sites/generate-hero-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        siteId,
        nichePrompt: `${title}. ${stripMarkers(start.headline)}`.trim(),
        theme: preset,
        layout: start.layout,
        wish,
      }),
    });
    const body = (await response.json()) as { url?: string; error?: string };
    setBusy("");
    if (!response.ok || !body.url) {
      setError(body.error || "Не удалось сгенерировать фон.");
      return;
    }
    patch({
      media: {
        ...start.media,
        type: "image",
        url: body.url,
        focalPoint: start.layout === "cinematic_hero" ? "right" : start.media.focalPoint,
      },
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold"><span>Стартовый экран</span></p>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-[#cf0234]" disabled={busy === "ai"} onClick={() => void improve()}>
          <Sparkles size={12} />
          <span>{busy === "ai" ? "Пишем" : "Улучшить с ИИ"}</span>
        </button>
      </div>
      {error ? <p className="text-xs text-[#cf0234]"><span>{error}</span></p> : null}
      <StudioToggle label="Показывать" checked={start.enabled} onChange={(enabled) => patch({ enabled })} />

      <Section title="Стиль" open={focus !== "gifts"}>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS.map((item) => (
            <button key={item.id} type="button" className={`rounded-xl border p-2 text-left ${start.layout === item.id ? "border-[#09090b]" : "border-[#e4e4e7]"}`} onClick={() => patch({ layout: item.id })}>
              <LayoutGlyph layout={item.id} />
              <span className="mt-1 block text-[10px]">{item.label}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Фон" open={focus !== "gifts"}>
        <div className="flex flex-wrap items-center gap-2">
          <UploadButton icon="upload" label={busy === "hero_media" ? "Загрузка" : "Загрузить фото или видео"} busy={busy === "hero_media"} onFile={(file) => void upload(siteId, "hero_media", file, setBusy, setError, (asset) => patch({ media: { ...start.media, type: asset.mimeType.startsWith("video/") ? "video" : "image", url: asset.url } }))} />
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-[#09090b] px-2.5 py-1.5 text-xs font-medium text-[#fff] disabled:opacity-60" disabled={busy === "hero_ai" || busy === "hero_media"} onClick={() => void generateBackground()}>
            {busy === "hero_ai" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            <span>{busy === "hero_ai" ? "Генерируем фон" : "✨ Сгенерировать фон с ИИ"}</span>
          </button>
        </div>
        <input className={field} placeholder="Пожелание: тёмная минималистичная ванная комната" value={wish} onChange={(event) => setWish(event.target.value)} />
        {start.media.url ? <button type="button" className="text-left text-xs text-[#71717a]" onClick={() => patch({ media: { ...start.media, type: "none", url: null } })}><span>Убрать фон</span></button> : null}
        <input className={field} placeholder="Или URL фото / видео" value={start.media.url ?? ""} onChange={(event) => {
          const url = event.target.value.trim();
          patch({ media: { ...start.media, url: url || null, type: !url ? "none" : /\.(mp4|webm)(\?|$)/i.test(url) ? "video" : "image" } });
        }} />
        {start.media.url ? (
          <>
            <label className="grid gap-1 text-xs text-[#52525b]">
              <span>{`Затемнение фона ${start.media.overlayOpacity}%`}</span>
              <input type="range" min={30} max={85} value={start.media.overlayOpacity} onChange={(event) => patch({ media: { ...start.media, overlayOpacity: Number(event.target.value) } })} />
            </label>
            <StudioSelect ariaLabel="Точка фокуса" value={start.media.focalPoint} onChange={(focalPoint) => patch({ media: { ...start.media, focalPoint: focalPoint as QuizSchema["startScreen"]["media"]["focalPoint"] } })} options={[
              { value: "center", label: "Центр" },
              { value: "left", label: "Лево" },
              { value: "right", label: "Право" },
              { value: "top", label: "Верх" },
            ]} />
          </>
        ) : null}
      </Section>

      <Section title="Текст" open={focus !== "gifts"}>
        <label className="grid gap-1 text-xs text-[#52525b]">
          <span>Заголовок</span>
          <textarea ref={headlineRef} className={`${field} h-20 py-2`} value={start.headline} onChange={(event) => patch({ headline: event.target.value })} />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="rounded-lg border border-[#e4e4e7] bg-[#fafafa] px-2.5 py-1 text-xs text-[#09090b] hover:bg-[#f4f4f5]" onClick={() => patch({ headline: wrapAccent(start.headline, headlineRef.current) })}><span>Выделить акцент</span></button>
          <div className="inline-flex rounded-lg bg-[#f4f4f5] p-0.5 text-xs">
            {(["badge", "accent_text", "underline"] as const).map((item) => (
              <button key={item} type="button" className={`rounded-md px-2.5 py-1 ${start.highlightStyle === item ? "bg-[#fff] font-medium text-[#09090b]" : "text-[#71717a]"}`} onClick={() => patch({ highlightStyle: item })}>
                <span>{item === "badge" ? "Плашка" : item === "accent_text" ? "Цвет" : "Линия"}</span>
              </button>
            ))}
          </div>
        </div>
        <ToggleText label="Подзаголовок" value={start.subheadline} onChange={(subheadline) => patch({ subheadline })} />
        <ToggleText label="Надзаголовок" value={start.eyebrow} onChange={(eyebrow) => patch({ eyebrow })} />
        <StudioToggle label="Бейдж доверия" checked={start.trustBadge.show} onChange={(show) => patch({ trustBadge: { ...start.trustBadge, show } })} />
        {start.trustBadge.show ? (
          <div className="grid gap-2">
            <input className={field} placeholder="4.9 Google" value={start.trustBadge.primaryText} onChange={(event) => patch({ trustBadge: { ...start.trustBadge, primaryText: event.target.value } })} />
            <input className={field} placeholder="Вторая строка" value={start.trustBadge.secondaryText ?? ""} onChange={(event) => patch({ trustBadge: { ...start.trustBadge, secondaryText: event.target.value } })} />
          </div>
        ) : null}
      </Section>

      <Section title="Буллиты">
        <StudioToggle label="Показывать" checked={start.bullets.show} onChange={(show) => patch({ bullets: { ...start.bullets, show } })} />
        <div className="grid grid-cols-2 gap-2">
          <StudioSelect ariaLabel="Маркеры" value={start.bullets.iconStyle} onChange={(iconStyle) => patch({ bullets: { ...start.bullets, iconStyle: iconStyle as QuizSchema["startScreen"]["bullets"]["iconStyle"] } })} options={[{ value: "check", label: "Галочки" }, { value: "icon", label: "Иконки" }, { value: "number", label: "Цифры" }]} />
          <StudioSelect ariaLabel="Сетка" value={start.bullets.layout} onChange={(layout) => patch({ bullets: { ...start.bullets, layout: layout as QuizSchema["startScreen"]["bullets"]["layout"] } })} options={[{ value: "auto", label: "Авто" }, { value: "grid_2", label: "2×2" }, { value: "stack", label: "Список" }]} />
        </div>
        <p className="text-[11px] text-[#71717a]"><span>**текст** делает цифры жирными.</span></p>
        {start.bullets.items.map((item, index) => (
          <div key={item.id} className="flex gap-2">
            {start.bullets.iconStyle === "icon" ? (
              <StudioSelect ariaLabel="Иконка пункта" value={item.icon || "check"} onChange={(icon) => patch({ bullets: { ...start.bullets, items: start.bullets.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, icon } : entry) } })} options={BULLET_ICONS.map(([id, label]) => ({ value: id, label }))} />
            ) : null}
            <input className={field} value={item.text} onChange={(event) => patch({ bullets: { ...start.bullets, items: start.bullets.items.map((entry, entryIndex) => entryIndex === index ? { ...entry, text: event.target.value } : entry) } })} />
            <button type="button" className="text-xs text-[#cf0234]" onClick={() => patch({ bullets: { ...start.bullets, items: start.bullets.items.filter((entry) => entry.id !== item.id) } })}><span>Удалить</span></button>
          </div>
        ))}
        {start.bullets.items.length < 6 ? (
          <button type="button" className="text-left text-xs text-[#cf0234]" onClick={() => patch({ bullets: { ...start.bullets, show: true, items: [...start.bullets.items, { id: `b-${Math.random().toString(36).slice(2, 7)}`, text: "Новый пункт", icon: "check" }] } })}>
            <span>+ Пункт</span>
          </button>
        ) : null}
      </Section>

      <Section title="Кнопка">
        <input className={field} value={start.ctaText} onChange={(event) => patch({ ctaText: event.target.value })} />
        <ToggleText label="Подпись под кнопкой" value={start.ctaMicroText} onChange={(ctaMicroText) => patch({ ctaMicroText })} />
      </Section>

      <Section title="Лид-магниты" open={focus === "gifts"}>
        <GiftsEditor siteId={siteId} draft={draft} onChange={onChange} busy={busy} setBusy={setBusy} setError={setError} />
      </Section>
    </div>
  );
}

function GiftsEditor({
  siteId,
  draft,
  onChange,
  busy,
  setBusy,
  setError,
}: {
  siteId: string;
  draft: QuizSchema;
  onChange: (draft: QuizSchema) => void;
  busy: string;
  setBusy: (value: string) => void;
  setError: (value: string) => void;
}) {
  const gifts = draft.giftsConfig;
  function patch(next: Partial<QuizSchema["giftsConfig"]>) {
    onChange({ ...draft, giftsConfig: { ...gifts, ...next } });
  }
  function update(id: string, next: Partial<QuizGift>) {
    patch({ items: gifts.items.map((item) => item.id === id ? { ...item, ...next } : item) });
  }
  return (
    <div className="grid gap-3">
      <StudioToggle label="На старте" checked={gifts.showOnStart} onChange={(showOnStart) => patch({ showOnStart })} />
      <StudioToggle label="Напоминать на шагах" checked={gifts.showInProgress} onChange={(showInProgress) => patch({ showInProgress })} />
      <StudioToggle label="Выдавать на экране «Спасибо»" checked={gifts.showOnThankYou} onChange={(showOnThankYou) => patch({ showOnThankYou })} />
      <DeliveryFields gifts={gifts} onChange={patch} />
      <input className={field} value={gifts.sectionLabel} onChange={(event) => patch({ sectionLabel: event.target.value })} />
      {gifts.items.map((item) => (
        <div key={item.id} className="relative grid gap-2 rounded-xl border border-[#e4e4e7] p-3">
          <button type="button" className="absolute right-2 top-2 text-[#a1a1aa] hover:text-[#09090b]" aria-label="Удалить подарок" onClick={() => patch({ items: gifts.items.filter((entry) => entry.id !== item.id) })}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <StudioSelect ariaLabel="Тип подарка" value={item.type} onChange={(type) => update(item.id, { type: type as GiftType })} options={[{ value: "file", label: "Файл / PDF" }, { value: "link", label: "Ссылка / Каталог" }, { value: "discount", label: "Скидка / Расчёт" }]} />
          <input className={field} placeholder="Название" value={item.title} onChange={(event) => update(item.id, { title: event.target.value })} />
          <input className={field} placeholder="Короткое описание" value={item.subtitle} onChange={(event) => update(item.id, { subtitle: event.target.value })} />
          {item.type === "link" ? <input className={field} placeholder="https://" value={item.actionUrl ?? ""} onChange={(event) => update(item.id, { actionUrl: event.target.value || null })} /> : null}
          <input className={field} placeholder="Текст кнопки на экране «Спасибо»" value={item.actionLabel} onChange={(event) => update(item.id, { actionLabel: event.target.value })} />
          {item.type === "file" ? (
            <div className="flex flex-wrap items-center gap-2 pr-6 text-xs">
              <UploadButton icon="file" label={busy === `file-${item.id}` ? "Загрузка" : item.fileName ? "Заменить файл" : "Загрузить файл"} busy={busy === `file-${item.id}`} onFile={(file) => void upload(siteId, "gift_file", file, setBusy, setError, (asset) => update(item.id, { fileUrl: asset.url, fileName: asset.fileName }), `file-${item.id}`)} />
              {item.fileName ? <span className="truncate text-[#52525b]">{item.fileName}</span> : null}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-2 pr-6 text-xs">
            <UploadButton icon="image" label={busy === `cover-${item.id}` ? "Загрузка" : "Обложка"} busy={busy === `cover-${item.id}`} onFile={(file) => void upload(siteId, "gift_cover", file, setBusy, setError, (asset) => update(item.id, { coverUrl: asset.url }), `cover-${item.id}`)} />
            {item.coverUrl ? <button type="button" className="text-[#71717a]" onClick={() => update(item.id, { coverUrl: null })}><span>Убрать обложку</span></button> : <span className="text-[#71717a]">Без обложки нарисуется карточка документа</span>}
          </div>
        </div>
      ))}
      {gifts.items.length < 3 ? (
        <button type="button" className="text-left text-xs text-[#cf0234]" onClick={() => patch({ items: [...gifts.items, { id: `g-${Math.random().toString(36).slice(2, 7)}`, type: "file", title: "Новый подарок", subtitle: "", coverUrl: null, fileUrl: null, fileName: null, actionUrl: null, actionLabel: "Скачать PDF" }] })}>
          <span>+ Добавить подарок</span>
        </button>
      ) : null}
    </div>
  );
}

function Section({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="rounded-xl border border-[#e4e4e7] px-3 py-2">
      <summary className="cursor-pointer text-xs font-semibold"><span>{title}</span></summary>
      <div className="mt-3 grid gap-2">{children}</div>
    </details>
  );
}

function ToggleText({ label, value, onChange }: { label: string; value: { show: boolean; text: string }; onChange: (value: { show: boolean; text: string }) => void }) {
  return (
    <div className="grid gap-1">
      <StudioToggle label={label} checked={value.show} onChange={(show) => onChange({ ...value, show })} />
      {value.show ? <input className={field} value={value.text} onChange={(event) => onChange({ ...value, text: event.target.value })} /> : null}
    </div>
  );
}

function LayoutGlyph({ layout }: { layout: StartLayout }) {
  if (layout === "editorial_split") return <span className="grid h-8 grid-cols-2 gap-0.5"><span className="bg-[#f4f4f5]" /><span className="bg-[#d4d4d8]" /></span>;
  if (layout === "spotlight_center") return <span className="grid h-8 place-items-center bg-[#18181b]"><span className="h-1 w-6 bg-[#fff]" /></span>;
  if (layout === "swiss_minimal") return <span className="grid h-8 content-center gap-1 bg-[#fafafa] px-1"><span className="h-px w-4 bg-[#09090b]" /><span className="h-1 w-8 bg-[#09090b]" /></span>;
  return <span className="relative grid h-8 items-center bg-[#18181b] px-1"><span className="h-1 w-7 bg-[#fff]" /></span>;
}

function UploadButton({ label, busy, onFile, icon }: { label: string; busy: boolean; onFile: (file: File) => void; icon?: "upload" | "file" | "image" }) {
  const Icon = icon === "file" ? FileUp : icon === "image" ? ImagePlus : Upload;
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#e4e4e7] bg-[#fafafa] px-2.5 py-1.5 text-xs text-[#09090b] hover:bg-[#f4f4f5]">
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
      <input className="hidden" type="file" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} />
    </label>
  );
}

const DELIVERY: { id: DeliveryChannel; label: string }[] = [
  { id: "page", label: "На странице" },
  { id: "messenger", label: "В мессенджер" },
  { id: "email", label: "На email" },
];

export function DeliveryFields({ gifts, onChange }: { gifts: QuizSchema["giftsConfig"]; onChange: (next: Partial<QuizSchema["giftsConfig"]>) => void }) {
  return (
    <div className="grid gap-2">
      <p className="text-xs text-[#52525b]"><span>Способ выдачи</span></p>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#f4f4f5] p-0.5 text-[11px]">
        {DELIVERY.map((item) => (
          <button key={item.id} type="button" className={`rounded-md px-1 py-1.5 ${gifts.deliveryChannel === item.id ? "bg-[#fff] font-medium text-[#09090b]" : "text-[#71717a]"}`} onClick={() => onChange({ deliveryChannel: item.id })}>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
      {gifts.deliveryChannel === "messenger" ? (
        <input className={field} placeholder="https://wa.me/… или https://t.me/…" value={gifts.messengerUrl ?? ""} onChange={(event) => onChange({ messengerUrl: event.target.value.trim() || null })} />
      ) : null}
      {gifts.deliveryChannel === "email" ? (
        <textarea className={`${field} h-20 py-2`} placeholder="Проверьте «Входящие» или папку «Спам» — отправили расчёт и файл." value={gifts.emailNote ?? ""} onChange={(event) => onChange({ emailNote: event.target.value.slice(0, 180) || null })} />
      ) : null}
    </div>
  );
}

function wrapAccent(value: string, input: HTMLTextAreaElement | null) {
  const start = input?.selectionStart ?? value.length;
  const end = input?.selectionEnd ?? value.length;
  if (start === end) return `${value}${value ? " " : ""}==акцент==`;
  return `${value.slice(0, start)}==${value.slice(start, end)}==${value.slice(end)}`;
}

async function upload(
  siteId: string,
  kind: string,
  file: File,
  setBusy: (value: string) => void,
  setError: (value: string) => void,
  apply: (asset: { url: string; fileName: string; mimeType: string }) => void,
  key = kind,
) {
  setBusy(key);
  setError("");
  const body = new FormData();
  body.set("file", file);
  body.set("siteId", siteId);
  body.set("kind", kind);
  const response = await fetch("/api/sites/upload-asset", { method: "POST", body });
  const payload = (await response.json()) as { url?: string; fileName?: string; mimeType?: string; error?: string };
  setBusy("");
  if (!response.ok || !payload.url || !payload.fileName || !payload.mimeType) {
    setError(payload.error || "Не удалось загрузить файл.");
    return;
  }
  apply({ url: payload.url, fileName: payload.fileName, mimeType: payload.mimeType });
}
