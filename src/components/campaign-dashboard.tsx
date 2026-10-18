"use client";

import { Check, Clock, Copy, Download, Folder, Loader2, RefreshCw, Sparkles, ZoomIn } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FocusEvent } from "react";
import { createPortal } from "react-dom";

import { RefreshCreativesDialog, type RefreshCreativesPayload } from "@/components/refresh-creatives-dialog";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { formatRuDate, toDateInputValue } from "@/lib/ad-project-media";
import type { AdGeneration, AdStrategy } from "@/lib/ad-types";
import { cn } from "@/lib/utils";

export type ProjectStatus = "ready" | "processing" | "error";

export function CampaignDashboard({
  projectId,
  name: initialName,
  strategy: initialStrategy,
  status = "ready",
  generations: initialGenerations,
  updatedAt: initialUpdatedAt,
  creativesReplaceAt: initialReplaceAt,
  styleKey = null,
}: {
  projectId: string;
  name: string;
  strategy: AdStrategy | null;
  status?: ProjectStatus;
  generations: AdGeneration[];
  updatedAt: string | null;
  creativesReplaceAt: string | null;
  styleKey?: string | null;
}) {
  const router = useRouter();
  const [zoom, setZoom] = useState<string | null>(null);
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [strategy, setStrategy] = useState<AdStrategy | null>(initialStrategy);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [creativesReplaceAt, setCreativesReplaceAt] = useState(initialReplaceAt);
  const [generations, setGenerations] = useState(initialGenerations);
  const [saving, setSaving] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("active");

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

  async function saveStrategy(next: AdStrategy) {
    setStrategy(next);
    await patchProject({ strategy_data: next });
  }

  async function saveReplaceDate(value: string) {
    if (!value) return;
    await patchProject({ creatives_replace_at: value });
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
          styleId: payload.styleId,
          quantity: payload.quantity,
          creativesCount: payload.quantity,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        updated_at?: string | null;
        creatives_replace_at?: string | null;
      };
      if (!response.ok) {
        toast.error(typeof body.error === "string" ? body.error : "Не удалось обновить креативы.");
        setGenerations(initialGenerations);
        return;
      }
      if (typeof body.updated_at === "string") setUpdatedAt(body.updated_at);
      if (typeof body.creatives_replace_at === "string") setCreativesReplaceAt(body.creatives_replace_at);
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
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => void saveName()}
              className="min-w-0 flex-1 bg-transparent text-3xl font-bold text-white outline-none ring-0 placeholder:text-zinc-600 focus:underline"
              aria-label="Название проекта"
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
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={saving || refreshing || !strategy}
            onClick={() => {
              if (strategy) void patchProject({ name: name.trim(), strategy_data: strategy });
            }}
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={refreshing || !strategy}
            onClick={() => setRefreshOpen(true)}
          >
            {refreshing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            + Обновить креативы
          </Button>
          <Button
            type="button"
            className="bg-white text-black hover:bg-zinc-200 hover:shadow-none"
            onClick={() => toast.success("Архив формируется... (в разработке)")}
          >
            <Download className="size-4" />
            Экспорт в ZIP
          </Button>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="rounded-xl border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur lg:col-span-1">
          <Accordion type="multiple" defaultValue={["strategy"]} className="w-full">
            <AccordionItem value="strategy">
              <AccordionTrigger>Стратегия</AccordionTrigger>
              <AccordionContent>
                {strategy ? (
                  <div className="grid gap-5">
                    <EditableText
                      label="Портрет аудитории"
                      value={strategy.strategy.target_audience_insight}
                      multiline
                      onCommit={(value) =>
                        void saveStrategy({
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
                        void saveStrategy({
                          ...strategy,
                          strategy: { ...strategy.strategy, core_offer_angle: value },
                        })
                      }
                    />
                    <EditableText
                      label="Крючок"
                      value={strategy.strategy.hook_concept}
                      multiline
                      onCommit={(value) =>
                        void saveStrategy({
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
            <AccordionItem value="texts">
              <AccordionTrigger>Тексты для креативов</AccordionTrigger>
              <AccordionContent className="grid gap-5">
                {strategy ? (
                  <>
                    <EditableList
                      label="Заголовки"
                      items={strategy.creatives.headlines}
                      onCommit={(items) =>
                        void saveStrategy({
                          ...strategy,
                          creatives: { ...strategy.creatives, headlines: items },
                        })
                      }
                    />
                    <EditableList
                      label="Подзаголовки"
                      items={strategy.creatives.subheadlines}
                      onCommit={(items) =>
                        void saveStrategy({
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
                        void saveStrategy({
                          ...strategy,
                          creatives: { ...strategy.creatives, benefits: items },
                        })
                      }
                    />
                    <EditableList
                      label="Кнопки"
                      items={strategy.creatives.buttons}
                      onCommit={(items) =>
                        void saveStrategy({
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
            <AccordionItem value="facebook">
              <AccordionTrigger>Упаковка кампании (Facebook Ads)</AccordionTrigger>
              <AccordionContent className="grid gap-5">
                {strategy ? (
                  <>
                    <EditableList
                      label="Основной текст поста"
                      items={strategy.facebook_setup.primary_texts}
                      multiline
                      onCommit={(items) =>
                        void saveStrategy({
                          ...strategy,
                          facebook_setup: { ...strategy.facebook_setup, primary_texts: items },
                        })
                      }
                    />
                    <EditableList
                      label="Заголовок объявления"
                      items={strategy.facebook_setup.headlines}
                      onCommit={(items) =>
                        void saveStrategy({
                          ...strategy,
                          facebook_setup: { ...strategy.facebook_setup, headlines: items },
                        })
                      }
                    />
                    <EditableList
                      label="Описание объявления"
                      items={strategy.facebook_setup.descriptions}
                      onCommit={(items) =>
                        void saveStrategy({
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
            <AccordionItem value="lead">
              <AccordionTrigger>Настройка Лид-формы</AccordionTrigger>
              <AccordionContent className="grid gap-5">
                {strategy ? (
                  <>
                    <EditableText
                      label="Заголовок"
                      value={strategy.lead_form.headline}
                      onCommit={(value) =>
                        void saveStrategy({
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
                        void saveStrategy({
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
                        void saveStrategy({
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
                        void saveStrategy({
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
                        void saveStrategy({
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
                <ActiveCreatives generation={activeGeneration} onZoom={setZoom} />
              )}
            </TabsContent>
            <TabsContent value="archive" className="grid gap-3">
              {archivedGenerations.length === 0 ? (
                <EmptyPanel text="Архив генераций пуст." />
              ) : (
                archivedGenerations.map((generation) => (
                  <div
                    key={generation.id}
                    className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                  >
                    <Folder className="size-5 shrink-0 text-zinc-300" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-200">
                        {generation.title} ({generation.style_name})
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {formatCreated(generation.created_at)} · {imageCountLabel(generation.images.length)}
                      </p>
                    </div>
                    <Button type="button" variant="outline" onClick={() => toast.success("Папка откроется в следующей версии")}>
                      Открыть
                    </Button>
                  </div>
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
        onClose={() => {
          if (!refreshing) setRefreshOpen(false);
        }}
        onConfirm={(payload) => void startRefresh(payload)}
      />
      {zoom ? <ZoomImage src={zoom} onClose={() => setZoom(null)} /> : null}
    </div>
  );
}

function EditableText({
  label,
  value,
  multiline = false,
  onCommit,
}: {
  label: string;
  value: string;
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  function commit(event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const next = event.currentTarget.value.trim();
    if (!next || next === value) {
      setDraft(value);
      return;
    }
    onCommit(next);
  }

  return (
    <div className="grid gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      {multiline ? (
        <textarea
          value={draft}
          rows={4}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          className="w-full resize-y rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm leading-6 text-zinc-200 outline-none focus:border-zinc-500"
        />
      ) : (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          className="w-full rounded-lg border border-zinc-800 bg-black/40 px-3 py-2 text-sm leading-6 text-zinc-200 outline-none focus:border-zinc-500"
        />
      )}
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
          <textarea
            value={draft}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            className="min-w-0 flex-1 resize-y bg-transparent outline-none"
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

function ActiveCreatives({
  generation,
  onZoom,
}: {
  generation: AdGeneration | null;
  onZoom: (src: string) => void;
}) {
  if (!generation || generation.images.length === 0) {
    if (generation?.status === "processing") return <CreativeSkeletons />;
    return <EmptyPanel text="Активных креативов пока нет." />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {generation.images.map((imageUrl, index) => (
        <article key={`${generation.id}-${index}`} className="group relative overflow-hidden rounded-xl border border-zinc-800 bg-black">
          <img src={imageUrl} alt="" className="aspect-[4/5] w-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 backdrop-blur-sm transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            <div className="flex w-[min(16rem,80%)] flex-col gap-2">
              <Button type="button" variant="outline" onClick={() => onZoom(imageUrl)}>
                <ZoomIn className="size-4" />
                Увеличить
              </Button>
              <Button
                type="button"
                className="bg-white text-black hover:bg-zinc-200 hover:shadow-none"
                onClick={() => toast.success("Перегенерация в разработке")}
              >
                <RefreshCw className="size-4" />
                Перегенерировать (1 токен)
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
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

function ZoomImage({ src, onClose }: { src: string; onClose: () => void }) {
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
      <img src={src} alt="" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" />
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
