"use client";

import { Check, Copy, Loader2, Trash, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { mutate as swrMutate } from "swr";

import { saveWidgetSettings, uploadWidgetAvatar, type WidgetAvatarRole } from "@/app/agents/widget-actions";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_WIDGET_SETTINGS, type WidgetSettings } from "@/lib/agent-models";

const fieldClass =
  "w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white";
const labelClass = "text-[10px] font-semibold uppercase tracking-widest text-zinc-400";
const cardClass = "grid gap-3 rounded-2xl border border-zinc-800/60 bg-[#171717] p-4";

export type WidgetConnectModalProps = {
  agentId: string;
  initialSettings: WidgetSettings;
  onClose: () => void;
  onSaved?: (settings: WidgetSettings) => void;
};

/**
 * Конструктор веб-виджета: настройки (имена, поведение, цвета, аватары,
 * приветствие) с live-превью и вкладкой установки iframe-кода на сайт.
 * Строго тёмный стиль STRIKE: карточки #171717, акцент #dd0005.
 */
export function WidgetConnectModal({ agentId, initialSettings, onClose, onSaved }: WidgetConnectModalProps) {
  const router = useRouter();
  const [settings, setSettings] = useState<WidgetSettings>(initialSettings);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadingRole, setUploadingRole] = useState<WidgetAvatarRole | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function patch(patchValue: Partial<WidgetSettings>) {
    setSettings((current) => ({ ...current, ...patchValue }));
    setNotice(null);
  }

  async function onAvatarFile(role: WidgetAvatarRole, file: File | null) {
    if (!file) return;
    setError(null);
    setUploadingRole(role);
    try {
      const result = await uploadWidgetAvatar(file, agentId, role);
      if (!result.ok || !result.url) {
        setError(result.error ?? "Не удалось загрузить аватар.");
        return;
      }
      patch(role === "agent" ? { widget_avatar_agent: result.url } : { widget_avatar_operator: result.url });
    } catch {
      setError("Не удалось загрузить аватар.");
    } finally {
      setUploadingRole(null);
    }
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveWidgetSettings(agentId, settings);
      if (!result.ok || !result.settings) {
        setError(result.error ?? "Не удалось сохранить настройки виджета.");
        return;
      }
      setSettings(result.settings);
      setNotice("Настройки виджета сохранены");
      onSaved?.(result.settings);
      void swrMutate("/api/agents");
      router.refresh();
    });
  }

  const widgetUrl = `${origin || "https://strike-platform.vercel.app"}/widget/chat/${agentId}`;
  const embedCode = `<iframe src="${widgetUrl}" width="400" height="600" style="border:none;border-radius:16px;max-width:100%;" title="Чат STRIKE" loading="lazy"></iframe>`;

  async function copyEmbed() {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Не удалось скопировать код. Выделите его вручную.");
    }
  }

  // Портал в body обязателен: модалка открывается из карточки с backdrop-blur,
  // а backdrop-filter делает предка containing block для fixed-потомков — без
  // портала окно позиционировалось бы внутри узкой колонки, а не вьюпорта.
  return createPortal(
    <div
      data-channel-dialog=""
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.target as HTMLElement).tagName !== "TEXTAREA") event.preventDefault();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-connect-title"
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Web Widget</p>
            <h2 id="widget-connect-title" className="mt-1 text-2xl font-semibold text-white">
              Настройка виджета
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть настройку виджета"
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>

        <Tabs defaultValue="builder" className="flex min-h-0 flex-1 flex-col px-6 pt-5">
          <TabsList className="grid h-auto max-w-md shrink-0 grid-cols-2">
            <TabsTrigger value="builder">Конструктор виджета</TabsTrigger>
            <TabsTrigger value="install">Установка на сайт</TabsTrigger>
          </TabsList>

          <TabsContent value="builder" className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
            <div className="grid min-h-0 gap-6 lg:h-full lg:grid-cols-2">
              <div className="grid min-h-0 min-w-0 content-start gap-4 overflow-visible pr-0 lg:overflow-y-auto lg:pr-2">
                <section className={cardClass}>
                  <h3 className="text-sm font-semibold text-white">Имена в чате</h3>
                  <label className="grid gap-2">
                    <span className={labelClass}>Имя агента</span>
                    <input
                      className={fieldClass}
                      value={settings.widget_agent_name}
                      maxLength={120}
                      onChange={(event) => patch({ widget_agent_name: event.target.value })}
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className={labelClass}>Имя оператора</span>
                    <input
                      className={fieldClass}
                      value={settings.widget_operator_name}
                      maxLength={120}
                      onChange={(event) => patch({ widget_operator_name: event.target.value })}
                    />
                  </label>
                </section>

                <section className={cardClass}>
                  <h3 className="text-sm font-semibold text-white">Поведение</h3>
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-sm text-zinc-300">Автоматическое раскрытие виджета</span>
                    <Switch
                      checked={settings.widget_auto_open}
                      onCheckedChange={(checked) => patch({ widget_auto_open: checked })}
                      aria-label="Автоматическое раскрытие виджета"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className={labelClass}>Задержка открытия (сек)</span>
                    <input
                      className={fieldClass}
                      type="number"
                      min={1}
                      max={60}
                      step={1}
                      value={settings.widget_open_delay}
                      disabled={!settings.widget_auto_open}
                      onChange={(event) => patch({ widget_open_delay: Number(event.target.value) })}
                    />
                  </label>
                </section>

                <section className={cardClass}>
                  <h3 className="text-sm font-semibold text-white">Цвета</h3>
                  <ColorField
                    label="Фон хэдера"
                    value={settings.widget_color_header_bg}
                    onChange={(widget_color_header_bg) => patch({ widget_color_header_bg })}
                  />
                  <ColorField
                    label="Текст хэдера"
                    value={settings.widget_color_header_text}
                    onChange={(widget_color_header_text) => patch({ widget_color_header_text })}
                  />
                </section>

                <section className={cardClass}>
                  <h3 className="text-sm font-semibold text-white">Аватары</h3>
                  <AvatarField
                    label="Аватар агента"
                    url={settings.widget_avatar_agent}
                    uploading={uploadingRole === "agent"}
                    onFile={(file) => void onAvatarFile("agent", file)}
                    onClear={() => patch({ widget_avatar_agent: null })}
                  />
                  <AvatarField
                    label="Аватар сотрудника"
                    url={settings.widget_avatar_operator}
                    uploading={uploadingRole === "operator"}
                    onFile={(file) => void onAvatarFile("operator", file)}
                    onClear={() => patch({ widget_avatar_operator: null })}
                  />
                </section>

                <section className={cardClass}>
                  <h3 className="text-sm font-semibold text-white">Приветствие</h3>
                  <label className="grid gap-2">
                    <span className={labelClass}>Стартовое сообщение</span>
                    <textarea
                      className={`${fieldClass} min-h-24 resize-y`}
                      value={settings.widget_greeting}
                      maxLength={1000}
                      onChange={(event) => patch({ widget_greeting: event.target.value })}
                    />
                  </label>
                </section>
              </div>

              <WidgetPreview settings={settings} />
            </div>
          </TabsContent>

          <TabsContent value="install" className="min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-4 pb-1">
              <section className={cardClass}>
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-white">Код виджета</h3>
                  <button
                    type="button"
                    onClick={() => void copyEmbed()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-black px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800"
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? "Скопировано" : "Копировать"}
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-xl border border-zinc-800 bg-black p-4 text-xs leading-5 whitespace-pre-wrap text-zinc-300">{embedCode}</pre>
                <p className="text-xs leading-5 text-zinc-400">
                  Страница виджета:{" "}
                  <a href={widgetUrl} target="_blank" rel="noreferrer" className="text-white underline underline-offset-2">
                    {widgetUrl}
                  </a>
                </p>
              </section>

              <section className={cardClass}>
                <h3 className="text-sm font-semibold text-white">Инструкция по установке</h3>
                <ol className="grid list-none gap-3 text-sm leading-6 text-zinc-300">
                  <InstallStep n={1}>Скопируйте код виджета кнопкой выше.</InstallStep>
                  <InstallStep n={2}>
                    Откройте исходный код вашего сайта (или настройки CMS, например Tilda, WordPress).
                  </InstallStep>
                  <InstallStep n={3}>
                    Вставьте скопированный код прямо перед закрывающим тегом <code className="rounded bg-black px-1.5 py-0.5 text-xs text-white">&lt;/body&gt;</code>.
                  </InstallStep>
                  <InstallStep n={4}>Сохраните изменения и опубликуйте сайт.</InstallStep>
                </ol>
              </section>
            </div>
          </TabsContent>
        </Tabs>

        {error ? <p className="shrink-0 px-6 pt-4 text-sm text-red-400">{error}</p> : null}
        {notice ? <p className="shrink-0 px-6 pt-4 text-sm text-zinc-300">{notice}</p> : null}

        <div className="flex shrink-0 justify-end gap-2 px-6 py-5">
          <button
            type="button"
            className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            onClick={onClose}
          >
            Закрыть
          </button>
          <button
            type="button"
            className="rounded-xl bg-[#dd0005] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            disabled={pending || uploadingRole !== null}
            onClick={onSave}
          >
            {pending ? "Сохранение" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InstallStep({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#dd0005] text-xs font-semibold text-white">{n}</span>
      <span>{children}</span>
    </li>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2">
      <span className={labelClass}>{label}</span>
      <span className="flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#171717"}
          aria-label={label}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-xl border border-zinc-800 bg-black p-1"
          onChange={(event) => onChange(event.target.value)}
        />
        <input
          className={fieldClass}
          value={value}
          maxLength={7}
          placeholder="#171717"
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
    </label>
  );
}

function AvatarField({
  label,
  url,
  uploading,
  onFile,
  onClear,
}: {
  label: string;
  url: string | null;
  uploading: boolean;
  onFile: (file: File | null) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-3">
      {url ? (
        <img src={url} alt="" className="size-11 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-zinc-800 text-[10px] font-semibold text-zinc-400">
          НЕТ
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={labelClass}>{label}</p>
        <p className="mt-1 truncate text-xs text-zinc-500">{url ?? "Стандартный аватар"}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          onFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-700 bg-black px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
      >
        {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
        {uploading ? "Загрузка" : "Загрузить"}
      </button>
      {url ? (
        <button
          type="button"
          aria-label={`Удалить: ${label}`}
          disabled={uploading}
          onClick={onClear}
          className="shrink-0 text-red-500 transition-colors hover:text-red-400 disabled:opacity-40"
        >
          <Trash className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

/** Мок виджета, мгновенно отражающий настройки из левой колонки. */
function WidgetPreview({ settings }: { settings: WidgetSettings }) {
  return (
    <div className="min-w-0">
      <p className={labelClass}>Live-превью</p>
      <div className="mt-2 overflow-hidden rounded-[24px] border border-zinc-800 bg-[#0a0a0a]">
        <header
          className="flex items-center gap-3 px-4 py-3"
          style={{ backgroundColor: settings.widget_color_header_bg, color: settings.widget_color_header_text }}
        >
          <PreviewAvatar url={settings.widget_avatar_agent} name={settings.widget_agent_name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{settings.widget_agent_name || DEFAULT_WIDGET_SETTINGS.widget_agent_name}</p>
            <p className="text-[11px] opacity-70">онлайн</p>
          </div>
        </header>

        <div className="grid gap-3 px-4 py-4">
          <div className="flex max-w-[88%] min-w-0 items-end gap-2">
            <PreviewAvatar url={settings.widget_avatar_agent} name={settings.widget_agent_name} small />
            <article className="min-w-0 rounded-2xl rounded-bl-md bg-[#262626] px-3.5 py-2.5">
              <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-zinc-400">
                {settings.widget_agent_name || DEFAULT_WIDGET_SETTINGS.widget_agent_name}
              </p>
              <p className="text-sm leading-6 whitespace-pre-wrap text-zinc-100">
                {settings.widget_greeting || DEFAULT_WIDGET_SETTINGS.widget_greeting}
              </p>
            </article>
          </div>

          <article className="max-w-[85%] justify-self-end rounded-2xl rounded-br-md bg-[#dd0005] px-3.5 py-2.5 text-white">
            <p className="text-sm leading-6">Здравствуйте! Сколько стоит подключение?</p>
          </article>

          <div className="flex max-w-[88%] min-w-0 items-end gap-2">
            <PreviewAvatar url={settings.widget_avatar_operator} name={settings.widget_operator_name} small />
            <article className="min-w-0 rounded-2xl rounded-bl-md bg-[#262626] px-3.5 py-2.5">
              <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-zinc-400">
                {settings.widget_operator_name || DEFAULT_WIDGET_SETTINGS.widget_operator_name}
              </p>
              <p className="text-sm leading-6 whitespace-pre-wrap text-zinc-100">Подключаю менеджера, одну минуту.</p>
            </article>
          </div>
        </div>

        <div className="border-t border-zinc-800 px-3 pt-3">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-[#171717] px-3.5 py-2.5 text-sm text-zinc-500">
              Напишите сообщение
            </span>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#dd0005] text-xs font-semibold text-white">➤</span>
          </div>
          <p className="px-1 pt-2 pb-3 text-center text-[10px] text-neutral-500">
            Разработано на платформе{" "}
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-neutral-400 transition-colors hover:text-[#dd0005]"
            >
              STRIKE
            </a>
          </p>
        </div>
      </div>
      {settings.widget_auto_open ? (
        <p className="mt-2 text-xs text-zinc-400">
          Виджет откроется автоматически через {settings.widget_open_delay} сек после загрузки страницы.
        </p>
      ) : null}
    </div>
  );
}

function PreviewAvatar({ url, name, small = false }: { url: string | null; name: string; small?: boolean }) {
  if (url) {
    return <img src={url} alt="" className={`${small ? "size-6" : "size-9"} shrink-0 rounded-full object-cover`} />;
  }
  const initials = (name.trim().slice(0, 2) || "AI").toUpperCase();
  return (
    <span
      className={`grid ${small ? "size-6 text-[9px]" : "size-9 text-xs"} shrink-0 place-items-center rounded-full bg-[#dd0005] font-semibold text-white`}
    >
      {initials}
    </span>
  );
}
