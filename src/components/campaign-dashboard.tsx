"use client";

import { Check, Clock, Copy, Download, Folder, Info, Loader2, Pencil, RefreshCw, Sparkles, Trash2, ZoomIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import TextareaAutosize from "react-textarea-autosize";

import { CreativeRender } from "@/components/creatives/CreativeRender";
import { RefreshCreativesDialog, type RefreshCreativesPayload } from "@/components/refresh-creatives-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { DEFAULT_ACCENT_COLOR, resolveAccentHex } from "@/lib/accent-color";
import { formatRuDate, toDateInputValue } from "@/lib/ad-project-media";
import { downloadActiveCreativesAsZip } from "@/lib/export-utils";
import type { AdGeneration, AdStrategy } from "@/lib/ad-types";
import { limitBadgeWords } from "@/lib/badge-copy";
import { cn } from "@/lib/utils";
import { resolveCreativeStyleId } from "@/lib/studio-styles";
import type { CreativeTemplateProps } from "@/types/creatives";

export type ProjectStatus = "ready" | "processing" | "error";

type ZoomCreative = {
  styleId: string | null;
  props: CreativeTemplateProps;
};

export function CampaignDashboard({
  projectId,
  name: initialName,
  strategy: initialStrategy,
  status = "ready",
  generations: initialGenerations,
  updatedAt: initialUpdatedAt,
  creativesReplaceAt: initialReplaceAt,
  styleKey = null,
  accentColor: initialAccent = null,
}: {
  projectId: string;
  name: string;
  strategy: AdStrategy | null;
  status?: ProjectStatus;
  generations: AdGeneration[];
  updatedAt: string | null;
  creativesReplaceAt: string | null;
  styleKey?: string | null;
  accentColor?: string | null;
}) {
  const router = useRouter();
  const [zoom, setZoom] = useState<ZoomCreative | null>(null);
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [strategy, setStrategy] = useState<AdStrategy | null>(initialStrategy);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [creativesReplaceAt, setCreativesReplaceAt] = useState(initialReplaceAt);
  const [generations, setGenerations] = useState(initialGenerations);
  const [saving, setSaving] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exportingZip, setExportingZip] = useState(false);
  const [activeTab, setActiveTab] = useState("active");
  const [accentColor, setAccentColor] = useState(
    resolveAccentHex(initialAccent, DEFAULT_ACCENT_COLOR),
  );

  useEffect(() => {
    setAccentColor(resolveAccentHex(initialAccent, DEFAULT_ACCENT_COLOR));
  }, [initialAccent]);

  useEffect(() => {
    setGenerations(initialGenerations);
  }, [initialGenerations]);

  const activeGeneration = generations.find((generation) => generation.is_active) ?? null;
  const archivedGenerations = generations.filter((generation) => !generation.is_active);

  async function patchProject(body: Record<string, unknown>) {
    setSaving(true);
    try {
      const response = await fetch(`/api/ads/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        error?: string;
        updated_at?: string | null;
        creatives_replace_at?: string | null;
        name?: string;
        strategy_data?: AdStrategy;
      };
      if (!response.ok) {
        toast.error(typeof payload.error === "string" ? payload.error : "Не удалось сохранить.");
        return false;
      }
      if (typeof payload.updated_at === "string") setUpdatedAt(payload.updated_at);
      if ("creatives_replace_at" in payload) {
        setCreativesReplaceAt(typeof payload.creatives_replace_at === "string" ? payload.creatives_replace_at : null);
      }
      if (typeof payload.name === "string") {
        setName(payload.name);
        setSavedName(payload.name);
      }
      if (payload.strategy_data) setStrategy(payload.strategy_data);
      toast.success("Сохранено");
      return true;
    } catch {
      toast.error("Не удалось связаться с сервером.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveName() {
    const next = name.trim();
    if (!next) {
      setName(savedName);
      return;
    }
    if (next === savedName) return;
    await patchProject({ name: next });
  }

  async function saveStrategy(next: AdStrategy): Promise<boolean> {
    setStrategy(next);
    return patchProject({ strategy_data: next });
  }

  async function saveReplaceDate(value: string) {
    if (!value) return;
    await patchProject({ creatives_replace_at: value });
  }

  async function exportZip() {
    if (exportingZip) return;
    setExportingZip(true);
    try {
      const count = await downloadActiveCreativesAsZip(savedName || name);
      if (count === 0) {
        toast.error("Нет активных креативов для экспорта.");
        return;
      }
      toast.success(`ZIP готов: креативов внутри — ${count}`);
    } catch {
      toast.error("Не удалось сформировать ZIP. Проверьте CORS бакета creatives.");
    } finally {
      setExportingZip(false);
    }
  }

  async function deleteArchivedCreative(
    generationId: string,
    creativeIndex: number,
    creativeId?: string | null,
  ): Promise<boolean> {
    const snapshot = generations;
    setGenerations((current) =>
      current.flatMap((generation) => {
        if (generation.id !== generationId) return [generation];
        const imageSets = generation.imageSets.filter((_, index) => index !== creativeIndex);
        const creatives = generation.creatives?.filter((_, index) => index !== creativeIndex);
        if (imageSets.length === 0 && !creatives?.length) return [];
        return [{ ...generation, imageSets, images: imageSets.flat(), ...(creatives ? { creatives } : {}) }];
      }),
    );

    try {
      const response = await fetch(`/api/ads/${projectId}/creatives`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generationId, creativeIndex, creativeId: creativeId ?? undefined }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setGenerations(snapshot);
        toast.error(typeof payload.error === "string" ? payload.error : "Не удалось удалить креатив.");
        return false;
      }
      toast.success("Креатив удалён");
      return true;
    } catch {
      setGenerations(snapshot);
      toast.error("Не удалось связаться с сервером.");
      return false;
    }
  }

  async function startRefresh(payload: RefreshCreativesPayload) {
    setRefreshOpen(false);
    setRefreshing(true);
    setActiveTab("active");
    setGenerations((current) =>
      current.map((generation) => (generation.is_active ? { ...generation, is_active: false } : generation)),
    );
    try {
      const response = await fetch("/api/generate-creatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          styleId: payload.styleIds[0],
          styleIds: payload.styleIds,
          quantity: payload.styleIds.length || payload.quantity,
          creativesCount: payload.styleIds.length || payload.quantity,
          accentColor: payload.accentColor,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        updated_at?: string | null;
        creatives_replace_at?: string | null;
        accent_color?: string | null;
      };
      if (!response.ok) {
        toast.error(typeof body.error === "string" ? body.error : "Не удалось обновить креативы.");
        setGenerations(initialGenerations);
        return;
      }
      if (typeof body.updated_at === "string") setUpdatedAt(body.updated_at);
      if (typeof body.creatives_replace_at === "string") setCreativesReplaceAt(body.creatives_replace_at);
      if (typeof body.accent_color === "string") setAccentColor(resolveAccentHex(body.accent_color));
      toast.success("Новые креативы готовы");
      router.refresh();
    } catch {
      toast.error("Не удалось связаться с сервером.");
      setGenerations(initialGenerations);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <LinkBack />
      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="group flex max-w-3xl items-start gap-3">
            <TextareaAutosize
              value={name}
              minRows={1}
              maxRows={3}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => void saveName()}
              className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-3xl font-bold break-words whitespace-normal text-white outline-none ring-0 placeholder:text-zinc-600 focus:underline"
              aria-label="Название проекта"
            />
            <Pencil
              aria-hidden="true"
              className="mt-2.5 h-5 w-5 flex-shrink-0 cursor-pointer text-neutral-500 opacity-0 transition-opacity group-hover:opacity-100"
              onClick={(event) => {
                event.currentTarget.parentElement?.querySelector("textarea")?.focus();
              }}
            />
            <ProjectStatusBadge status={status} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <p className="text-zinc-500">Обновлено: {formatRuDate(updatedAt)}</p>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-zinc-300">
              <Clock className="size-3.5 shrink-0" strokeWidth={2} />
              <span>Рекомендуемая замена креативов:</span>
              <input
                type="date"
                value={toDateInputValue(creativesReplaceAt)}
                onChange={(event) => {
                  const value = event.target.value;
                  setCreativesReplaceAt(value ? `${value}T12:00:00.000Z` : null);
                  void saveReplaceDate(value);
                }}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-200 outline-none focus:border-zinc-500"
              />
            </label>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:ml-auto">
          <Button
            type="button"
            disabled={refreshing || !strategy}
            className="bg-white font-bold text-black shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all hover:bg-neutral-200 hover:shadow-[0_0_15px_rgba(255,255,255,0.1)]"
            onClick={() => setRefreshOpen(true)}
          >
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Обновить креативы
          </Button>
          <Button
            type="button"
            variant="outline"
            className="border-white/20 bg-transparent text-white hover:bg-white/5 hover:text-white"
            disabled={exportingZip || refreshing || !activeGeneration}
            onClick={() => void exportZip()}
          >
            {exportingZip ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {exportingZip ? "Формируем ZIP…" : "Экспорт в ZIP"}
          </Button>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="rounded-xl border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur lg:col-span-1">
          <Accordion type="multiple" defaultValue={[]} className="w-full">
            <AccordionItem className="border-b border-white/10" value="texts">
              <AccordionTrigger>Тексты для креативов</AccordionTrigger>
              <AccordionContent className="grid gap-5">
                <div className="flex gap-3 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
                  <Info className="h-5 w-5 shrink-0 text-blue-300/70" />
                  <p className="text-sm leading-relaxed text-neutral-300">
                    Чтобы изменить тексты на самих креативах (заголовки, буллеты, бейджи), редактируйте поля
                    ниже. Изменения применятся после генерации.
                  </p>
                </div>
                {strategy ? (
                  <>
                    <EditableList
                      label="Заголовки"
                      items={strategy.creatives.headlines}
                      onCommit={(items) =>
                        saveStrategy({
                          ...strategy,
                          creatives: { ...strategy.creatives, headlines: items },
                        })
                      }
                    />
                    <EditableList
                      label="Подзаголовки"
                      items={strategy.creatives.subheadlines}
                      onCommit={(items) =>
                        saveStrategy({
                          ...strategy,
                          creatives: { ...strategy.creatives, subheadlines: items },
                        })
                      }
                    />
                    <EditableList
                      label="Выгоды"
                      items={strategy.creatives.benefits}
                      marked
                      onCommit={(items) =>
                        saveStrategy({
                          ...strategy,
                          creatives: { ...strategy.creatives, benefits: items },
                        })
                      }
                    />
                    <EditableList
                      label="Кнопки"
                      items={strategy.creatives.buttons}
                      onCommit={(items) =>
                        saveStrategy({
                          ...strategy,
                          creatives: { ...strategy.creatives, buttons: items },
                        })
                      }
                    />
                  </>
                ) : (
                  <MissingCopy />
                )}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem className="border-b border-white/10" value="strategy">
              <AccordionTrigger>Стратегия</AccordionTrigger>
              <AccordionContent>
                {strategy ? (
                  <div className="grid gap-5">
                    <EditableText
                      label="Портрет аудитории"
                      value={strategy.strategy.target_audience_insight}
                      multiline
                      onCommit={(value) =>
                        saveStrategy({
                          ...strategy,
                          strategy: { ...strategy.strategy, target_audience_insight: value },
                        })
                      }
                    />
                    <EditableText
                      label="Угол оффера"
                      value={strategy.strategy.core_offer_angle}
                      multiline
                      onCommit={(value) =>
                        saveStrategy({
                          ...strategy,
                          strategy: { ...strategy.strategy, core_offer_angle: value },
                        })
                      }
                    />
                    <EditableText
                      label="Спецпредложение и Триггер (УТП)"
                      value={strategy.strategy.hook_concept}
                      multiline
                      placeholder="Укажите акцию, подарок или ограничение (например: Скидка 20% до пятницы, Возьмем 2 проекта до конца месяца)"
                      hint="Коротко опишите вашу акцию, дедлайн или бонус. Нейросеть автоматически сожмет этот текст до яркого триггера (до 8 слов) и разместит на акцентной плашке креатива для привлечения внимания."
                      onCommit={(value) =>
                        saveStrategy({
                          ...strategy,
                          strategy: { ...strategy.strategy, hook_concept: value },
                        })
                      }
                    />
                  </div>
                ) : (
                  <MissingCopy />
                )}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem className="border-b border-white/10" value="facebook">
              <AccordionTrigger>Упаковка кампании (Facebook Ads)</AccordionTrigger>
              <AccordionContent className="grid gap-5">
                {strategy ? (
                  <>
                    <EditableList
                      label="Основной текст поста"
                      items={strategy.facebook_setup.primary_texts}
                      multiline
                      onCommit={(items) =>
                        saveStrategy({
                          ...strategy,
                          facebook_setup: { ...strategy.facebook_setup, primary_texts: items },
                        })
                      }
                    />
                    <EditableList
                      label="Заголовок объявления"
                      items={strategy.facebook_setup.headlines}
                      onCommit={(items) =>
                        saveStrategy({
                          ...strategy,
                          facebook_setup: { ...strategy.facebook_setup, headlines: items },
                        })
                      }
                    />
                    <EditableList
                      label="Описание объявления"
                      items={strategy.facebook_setup.descriptions}
                      onCommit={(items) =>
                        saveStrategy({
                          ...strategy,
                          facebook_setup: { ...strategy.facebook_setup, descriptions: items },
                        })
                      }
                    />
                  </>
                ) : (
                  <MissingCopy />
                )}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem className="border-b border-white/10" value="lead">
              <AccordionTrigger>Настройка Лид-формы</AccordionTrigger>
              <AccordionContent className="grid gap-5">
                {strategy ? (
                  <>
                    <EditableText
                      label="Заголовок"
                      value={strategy.lead_form.headline}
                      onCommit={(value) =>
                        saveStrategy({
                          ...strategy,
                          lead_form: { ...strategy.lead_form, headline: value },
                        })
                      }
                    />
                    <EditableList
                      label="Выгоды на первом экране"
                      items={strategy.lead_form.welcome_screen_bullets}
                      marked
                      onCommit={(items) =>
                        saveStrategy({
                          ...strategy,
                          lead_form: { ...strategy.lead_form, welcome_screen_bullets: items },
                        })
                      }
                    />
                    <LeadQuestions questions={strategy.lead_form.questions} />
                    <EditableText
                      label="Экран благодарности — заголовок"
                      value={strategy.lead_form.thank_you_screen.headline}
                      onCommit={(value) =>
                        saveStrategy({
                          ...strategy,
                          lead_form: {
                            ...strategy.lead_form,
                            thank_you_screen: { ...strategy.lead_form.thank_you_screen, headline: value },
                          },
                        })
                      }
                    />
                    <EditableText
                      label="Экран благодарности — описание"
                      value={strategy.lead_form.thank_you_screen.description}
                      multiline
                      onCommit={(value) =>
                        saveStrategy({
                          ...strategy,
                          lead_form: {
                            ...strategy.lead_form,
                            thank_you_screen: { ...strategy.lead_form.thank_you_screen, description: value },
                          },
                        })
                      }
                    />
                    <EditableText
                      label="Кнопка лид-формы"
                      value={strategy.lead_form.call_to_action}
                      onCommit={(value) =>
                        saveStrategy({
                          ...strategy,
                          lead_form: { ...strategy.lead_form, call_to_action: value },
                        })
                      }
                    />
                  </>
                ) : (
                  <MissingCopy />
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        <section className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="active">Активные креативы</TabsTrigger>
              <TabsTrigger value="archive">Архив генераций</TabsTrigger>
            </TabsList>
            <TabsContent value="active">
              {refreshing ? (
                <CreativeSkeletons />
              ) : (
                <CreativesGrid
                  generation={activeGeneration}
                  strategy={strategy}
                  styleKey={styleKey}
                  accentColor={accentColor}
                  onZoom={setZoom}
                  emptyText="Активных креативов пока нет."
                />
              )}
            </TabsContent>
            <TabsContent value="archive" className="grid gap-3">
              {archivedGenerations.length === 0 ? (
                <EmptyPanel text="Архив генераций пуст." />
              ) : (
                archivedGenerations.map((generation) => (
                  <ArchiveGenerationFolder
                    key={generation.id}
                    generation={generation}
                    strategy={strategy}
                    styleKey={styleKey}
                    accentColor={accentColor}
                    onZoom={setZoom}
                    onDeleteCreative={deleteArchivedCreative}
                  />
                ))
              )}
            </TabsContent>
          </Tabs>
        </section>
      </div>
      <RefreshCreativesDialog
        open={refreshOpen}
        pending={refreshing}
        initialStyle={styleKey}
        initialAccent={accentColor}
        onClose={() => {
          if (!refreshing) setRefreshOpen(false);
        }}
        onConfirm={(payload) => void startRefresh(payload)}
      />
      {zoom ? <ZoomCreativeModal creative={zoom} onClose={() => setZoom(null)} /> : null}
    </div>
  );
}

function EditableText({
  label,
  value,
  multiline = false,
  placeholder,
  hint,
  onCommit,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  placeholder?: string;
  hint?: string;
  onCommit: (value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value);
  const [baseline, setBaseline] = useState(value);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(value);
    setBaseline(value);
  }, [value]);

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), 1600);
    return () => clearTimeout(timer);
  }, [saved]);

  const isDirty = draft.trim().length > 0 && draft.trim() !== baseline.trim();

  async function save() {
    const next = draft.trim();
    if (!next || next === baseline.trim() || pending) return;
    setPending(true);
    try {
      const ok = await onCommit(next);
      if (ok) {
        setBaseline(next);
        setDraft(next);
        setSaved(true);
      }
    } finally {
      setPending(false);
    }
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    // Cmd/Ctrl + Enter saves from inside the field.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void save();
      return;
    }
    if (!multiline && event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  }

  return (
    <div className="grid gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <div className="relative">
        {multiline ? (
          <TextareaAutosize
            value={draft}
            minRows={3}
            maxRows={8}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            className="scrollbar-macos w-full resize-none rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 pr-24 pb-10 text-sm leading-6 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          />
        ) : (
          <input
            value={draft}
            placeholder={placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 pr-24 text-sm leading-6 text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
          />
        )}
        {saved ? (
          <span className="animate-in absolute right-2 bottom-2 grid size-7 place-items-center rounded-md bg-emerald-500/15 text-emerald-400">
            <Check className="size-4" strokeWidth={3} />
          </span>
        ) : isDirty ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => void save()}
            className="animate-in absolute right-2 bottom-2 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-all hover:brightness-110 disabled:opacity-50"
          >
            {pending ? "Сохраняем…" : "Сохранить"}
          </button>
        ) : null}
      </div>
      {hint ? <p className="text-[11px] leading-relaxed text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function EditableList({
  label,
  items,
  marked = false,
  multiline = false,
  onCommit,
}: {
  label: string;
  items: string[];
  marked?: boolean;
  multiline?: boolean;
  onCommit: (items: string[]) => void;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <ul className="grid gap-2">
        {items.map((item, index) => (
          <li key={`${label}-${index}`}>
            <EditableRow
              text={item}
              marked={marked}
              multiline={multiline}
              onCommit={(value) => {
                const next = [...items];
                next[index] = value;
                onCommit(next);
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function EditableRow({
  text,
  marked = false,
  multiline = false,
  onCommit,
}: {
  text: string;
  marked?: boolean;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);

  function commit() {
    const next = draft.trim();
    if (!next || next === text) {
      setDraft(text);
      return;
    }
    onCommit(next);
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2">
      <div className={cn("flex min-w-0 flex-1 gap-2 text-sm leading-6 text-zinc-200", marked && "items-start")}>
        {marked ? <Check className="mt-1 size-3.5 shrink-0 text-zinc-400" /> : null}
        {multiline ? (
          <TextareaAutosize
            value={draft}
            minRows={2}
            maxRows={8}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            className="scrollbar-macos min-w-0 flex-1 resize-none bg-transparent outline-none"
          />
        ) : (
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            className="min-w-0 flex-1 bg-transparent outline-none"
          />
        )}
      </div>
      <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-zinc-400" onClick={() => copyText(text)}>
        <Copy className="size-3.5" />
        Скопировать
      </Button>
    </div>
  );
}

function ArchiveGenerationFolder({
  generation,
  strategy,
  styleKey,
  accentColor,
  onZoom,
  onDeleteCreative,
}: {
  generation: AdGeneration;
  strategy: AdStrategy | null;
  styleKey?: string | null;
  accentColor: string;
  onZoom: (creative: ZoomCreative) => void;
  onDeleteCreative: (generationId: string, creativeIndex: number, creativeId?: string | null) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const creativeCount = generation.imageSets?.length
    ? generation.imageSets.length
    : generation.images.length;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center gap-3 px-4 py-3">
        <Folder className="size-5 shrink-0 text-zinc-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-zinc-200">
            {generation.title} ({generation.style_name})
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {formatCreated(generation.created_at)} · {imageCountLabel(creativeCount)}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen((value) => !value)}>
          {open ? "Свернуть" : "Открыть"}
        </Button>
      </div>
      {open ? (
        <div className="border-t border-zinc-800 px-4 py-4">
          <CreativesGrid
            generation={generation}
            strategy={strategy}
            styleKey={styleKey}
            accentColor={accentColor}
            onZoom={onZoom}
            onDeleteCreative={onDeleteCreative}
            readOnly
            emptyText="В этой папке нет креативов."
          />
        </div>
      ) : null}
    </div>
  );
}

function CreativesGrid({
  generation,
  strategy,
  styleKey,
  accentColor,
  onZoom,
  onDeleteCreative,
  readOnly = false,
  emptyText = "Креативов пока нет.",
}: {
  generation: AdGeneration | null;
  strategy: AdStrategy | null;
  styleKey?: string | null;
  accentColor: string;
  onZoom: (creative: ZoomCreative) => void;
  onDeleteCreative?: (generationId: string, creativeIndex: number, creativeId?: string | null) => Promise<boolean>;
  readOnly?: boolean;
  emptyText?: string;
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  // Confirmation modal state: "<generationId>:<creativeIndex>" of the creative to delete.
  const [creativeToDelete, setCreativeToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const imageSets =
    generation?.imageSets?.length
      ? generation.imageSets
      : generation?.images?.length
        ? generation.images.map((url) => [url])
        : [];

  const headlines = strategy?.creatives.headlines ?? [];
  const subheadlines = strategy?.creatives.subheadlines ?? [];
  const bullets = strategy?.creatives.benefits ?? [];
  const buttons = strategy?.creatives.buttons ?? [];
  const hook = strategy?.strategy.hook_concept ?? "";
  const scope = readOnly ? "archive" : "active";
  // CreativeRender strictly maps creative_templates UUIDs; normalize legacy keys here.
  const renderStyleId = resolveCreativeStyleId(styleKey) ?? styleKey ?? null;

  // Cards prefer `ad_creatives` rows (per-creative texts + soft-delete id);
  // legacy generations fall back to image sets + strategy copy.
  const items = imageSets.map((urls, index) => {
    const creative = generation?.creatives?.[index] ?? null;
    const before = urls[0] ?? "";
    const after = urls[1] ?? urls[0] ?? "";
    const templateProps: CreativeTemplateProps = {
      headline: creative?.headline || headlines[index % Math.max(headlines.length, 1)] || hook || "Оффер",
      subheadline:
        creative?.subheadline ??
        subheadlines[index % Math.max(subheadlines.length, 1)] ??
        strategy?.strategy.core_offer_angle ??
        undefined,
      // Full benefits list (3–4 items) comes from the strategy; the
      // per-creative row only carries a single `benefit` string, which
      // previously collapsed every template to one bullet.
      bullets: bullets.length > 0
        ? bullets
        : creative?.bullets?.length
          ? creative.bullets
          : [strategy?.strategy.core_offer_angle ?? "Результат без хаоса"],
      badge: (creative?.badge ? limitBadgeWords(creative.badge) : "") || limitBadgeWords(hook) || "Оффер",
      buttonText: creative?.buttonText || buttons[index % Math.max(buttons.length, 1)] || "Узнать подробнее",
      images: [before, after],
      accentColor: creative?.accentColor ? resolveAccentHex(creative.accentColor, accentColor) : accentColor,
    };
    return {
      key: creative?.id ?? `legacy:${index}`,
      index,
      creativeId: creative?.id ?? null,
      styleId: resolveCreativeStyleId(creative?.styleId) ?? renderStyleId,
      templateProps,
    };
  });

  if (!generation || items.length === 0) {
    if (!readOnly && generation?.status === "processing") return <CreativeSkeletons />;
    return <EmptyPanel text={emptyText} />;
  }

  async function downloadOne(nodeId: string, fileName: string, key: string) {
    if (busyKey) return;
    setBusyKey(key);
    try {
      const { downloadCreativeAsPng } = await import("@/lib/export-utils");
      await downloadCreativeAsPng(nodeId, fileName);
    } catch {
      toast.error("Не удалось скачать PNG. Проверьте CORS бакета creatives.");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleConfirmDelete() {
    if (!generation || !onDeleteCreative || creativeToDelete === null || isDeleting) return;
    const item = items.find((candidate) => candidate.key === creativeToDelete);
    if (!item) {
      setCreativeToDelete(null);
      return;
    }
    setIsDeleting(true);
    try {
      // Soft delete on the server (deleted_at) + optimistic UI update.
      const deleted = await onDeleteCreative(generation.id, item.index, item.creativeId);
      if (deleted) setCreativeToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((item) => {
        const index = item.index;
        const nodeId = `creative-node-${scope}-${generation.id}-${index}`;
        const busy = busyKey === nodeId;
        const templateProps = item.templateProps;

        return (
          <article
            key={`${generation.id}-${item.key}`}
            className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-black"
          >
            {/* Export node wraps ONLY the creative itself — never the UI overlay,
                so html-to-image cannot capture system buttons into the PNG. */}
            <div
              id={nodeId}
              data-export-scope={scope}
              data-export-name={`creative-${index + 1}.png`}
              className="creative-export-node"
            >
              <CreativeRender styleId={item.styleId} {...templateProps} />
            </div>
            <div
              data-export-ignore="true"
              className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
            >
              <div className="flex w-[min(16rem,80%)] flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onZoom({ styleId: item.styleId, props: templateProps })}
                >
                  <ZoomIn className="size-4" />
                  Увеличить
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void downloadOne(nodeId, `creative-${index + 1}.png`, nodeId)}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                  Скачать
                </Button>
                {!readOnly ? (
                  <Button
                    type="button"
                    className="bg-white text-black hover:bg-zinc-200 hover:shadow-none"
                    onClick={() => toast.success("Перегенерация в разработке")}
                  >
                    <RefreshCw className="size-4" />
                    Перегенерировать (1 токен)
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-red-900/60 text-red-300 hover:bg-red-950/60 hover:text-red-200"
                    disabled={busy || isDeleting || !onDeleteCreative}
                    onClick={() => setCreativeToDelete(item.key)}
                  >
                    <Trash2 className="size-4" />
                    Удалить
                  </Button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>

    {creativeToDelete !== null ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Удалить креатив?"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isDeleting) setCreativeToDelete(null);
        }}
      >
        <div className="w-[min(90vw,28rem)] rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl">
          <h2 className="text-xl font-bold text-white">Удалить креатив?</h2>
          <p className="mt-3 text-gray-400">
            Вы уверены? Креатив будет скрыт из списка. Данные и изображение сохранятся в базе — их можно будет восстановить.
          </p>
          <div className="mt-6 flex gap-4">
            <button
              type="button"
              className="rounded-md bg-gray-800 px-4 py-2 text-white transition-colors hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isDeleting}
              onClick={() => setCreativeToDelete(null)}
            >
              Отмена
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 font-bold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isDeleting}
              onClick={() => void handleConfirmDelete()}
            >
              {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {isDeleting ? "Удаление…" : "Удалить"}
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}

function CreativeSkeletons() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="aspect-[4/5] animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
      ))}
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-900/30 px-6 py-10 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}

function formatCreated(value: string) {
  return formatRuDate(value);
}

function imageCountLabel(count: number) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? "картинка" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "картинки" : "картинок";
  return `${count} ${word}`;
}

function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400">
        <Loader2 className="size-3 animate-spin" />
        В процессе
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-400">
        Ошибка
      </span>
    );
  }
  return (
    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
      Готово
    </span>
  );
}

function LeadQuestions({ questions }: { questions: AdStrategy["lead_form"]["questions"] }) {
  return (
    <div className="grid gap-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Вопросы</p>
      <ul className="grid gap-3">
        {questions.map((question, index) => (
          <li key={`${question.question}-${index}`} className="grid gap-2">
            <CopyRow text={question.question} />
            <div className="flex flex-wrap gap-2">
              {question.options.map((answer, optionIndex) => (
                <Badge key={`${answer}-${optionIndex}`} variant="outline" className="text-zinc-400">
                  {answer}
                </Badge>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MissingCopy() {
  return <p className="text-sm leading-6 text-zinc-500">Эти тексты появятся, когда стратегия будет собрана.</p>;
}

function LinkBack() {
  return (
    <Link href="/ads" className="text-sm text-zinc-400 transition-colors hover:text-white">
      ← Все кампании
    </Link>
  );
}

function CopyRow({ text }: { text: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2">
      <p className="text-sm leading-6 text-zinc-200">{text}</p>
      <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-zinc-400" onClick={() => copyText(text)}>
        <Copy className="size-3.5" />
        Скопировать
      </Button>
    </div>
  );
}

function ZoomCreativeModal({ creative, onClose }: { creative: ZoomCreative; onClose: () => void }) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-[min(90vw,calc(90vh*4/5))] overflow-hidden rounded-xl shadow-2xl">
        <CreativeRender styleId={creative.styleId} {...creative.props} />
      </div>
    </div>,
    document.body,
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Скопировано");
  } catch {
    toast.error("Не удалось скопировать текст.");
  }
}
