"use client";

import { Check, Copy, Download, Folder, Loader2, RefreshCw, ZoomIn } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import type { AdGeneration } from "@/lib/ad-types";

const headlines = [
  "Белый ключ за 90 дней",
  "Смета не вырастет после договора",
  "Ремонт новостройки без вашего контроля",
  "Заехали через 3 месяца, а не через год",
  "1 000 ₽ в день, если сорвём срок",
];

const subheadlines = [
  "Цена и срок фиксируются до старта работ",
  "Один прораб ведёт объект от стяжки до уборки",
  "Фотоотчёт каждый вечер в WhatsApp",
  "Материалы закупаем по согласованной ведомости",
  "Приёмка по чек-листу, без скрытых работ",
];

const benefits = [
  "Срок 90 дней прописан в договоре",
  "Неустойка 1 000 ₽ за каждый день просрочки",
  "Смета не меняется после подписания",
  "Ежедневный фотоотчёт в WhatsApp",
  "Закупка материалов входит в договор",
  "Уборка перед сдачей включена в цену",
  "Один договор вместо десяти подрядчиков",
  "Прораб на связи в рабочие часы",
  "Приёмка по чек-листу из 42 пунктов",
  "Гарантия на работы 24 месяца",
];

const callsToAction = ["Рассчитать смету", "Забронировать замер", "Получить план за 90 дней"];

const postBodies = [
  "Купили квартиру в новостройке и уже полгода слушаете «ещё две недели»? Мы сдаём белый ключ за 90 дней. Смета и срок фиксируются в договоре до старта. Если задержимся, платим 1 000 ₽ за каждый день. Каждый вечер — фотоотчёт в WhatsApp, на приёмке чек-лист из 42 пунктов. Напишите площадь, посчитаем смету до выезда на замер.",
  "Ремонт под ключ для тех, кто не хочет жить на объекте. Один прораб, одна смета, один срок — 90 дней. Материалы закупаем сами по ведомости, уборка перед сдачей входит в цену, гарантия на работы 24 месяца. Оставьте площадь и дату заезда: вернём расчёт и ближайшее окно на замер.",
];

const adHeadlines = ["Белый ключ за 90 дней", "Смета зафиксирована в договоре", "Ремонт без вашего контроля"];

const adDescriptions = [
  "Неустойка 1 000 ₽ за день просрочки",
  "Фотоотчёт каждый вечер в WhatsApp",
  "Замер и расчёт сметы до старта",
];

const formBenefits = [
  "Срок и цена фиксируются до старта",
  "Неустойка за каждый день просрочки",
  "Фотоотчёт каждый вечер",
  "Гарантия на работы 24 месяца",
];

const leadQuestions = [
  {
    prompt: "Какая площадь квартиры?",
    answers: ["до 50 кв.м", "50-100 кв.м", "больше 100 кв.м"],
  },
  {
    prompt: "Когда планируете заехать?",
    answers: ["в этом месяце", "через 1–3 месяца", "дата не выбрана"],
  },
  {
    prompt: "Нужен ремонт под ключ или только черновые работы?",
    answers: ["под ключ", "только черновые"],
  },
  {
    prompt: "Какой бюджет уже заложен?",
    answers: ["до 1 млн ₽", "1–3 млн ₽", "больше 3 млн ₽"],
  },
];

export type ProjectStatus = "ready" | "processing" | "error";

const thanksMessage =
  "Смета почти готова. Напишите оператору в WhatsApp — пришлём расчёт и ближайшее окно на замер сегодня.";

const thanksCta = "Написать в WhatsApp";

export function CampaignDashboard({
  name,
  strategy,
  status = "ready",
  generations,
}: {
  name: string;
  strategy: string;
  status?: ProjectStatus;
  generations: AdGeneration[];
}) {
  const [zoom, setZoom] = useState<string | null>(null);
  const activeGeneration = generations.find((generation) => generation.is_active) ?? null;
  const archivedGenerations = generations.filter((generation) => !generation.is_active);

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-10">
      <LinkBack />
      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-white">{name}</h1>
          <ProjectStatusBadge status={status} />
        </div>
        <Button
          type="button"
          className="shrink-0 bg-white text-black hover:bg-zinc-200 hover:shadow-none"
          onClick={() => toast.success("Архив формируется... (в разработке)")}
        >
          <Download className="size-4" />
          Экспорт в ZIP
        </Button>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="rounded-xl border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur lg:col-span-1">
          <Accordion type="multiple" defaultValue={["strategy"]} className="w-full">
            <AccordionItem value="strategy">
              <AccordionTrigger>Стратегия</AccordionTrigger>
              <AccordionContent>
                <CopyRow text={strategy} />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="texts">
              <AccordionTrigger>Тексты для креативов</AccordionTrigger>
              <AccordionContent className="grid gap-5">
                <TextGroup label="Заголовки" items={headlines} />
                <TextGroup label="Подзаголовки" items={subheadlines} />
                <TextGroup label="Выгоды" items={benefits} marked />
                <TextGroup label="Кнопки" items={callsToAction} />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="facebook">
              <AccordionTrigger>Упаковка кампании (Facebook Ads)</AccordionTrigger>
              <AccordionContent className="grid gap-5">
                <TextGroup label="Основной текст поста" items={postBodies} />
                <TextGroup label="Заголовок объявления" items={adHeadlines} />
                <TextGroup label="Описание объявления" items={adDescriptions} />
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="lead">
              <AccordionTrigger>Настройка Лид-формы</AccordionTrigger>
              <AccordionContent className="grid gap-5">
                <TextGroup label="1 экран. Приветствие" items={["Узнайте стоимость белого ключа за 2 минуты"]} />
                <TextGroup label="Выгоды на первом экране" items={formBenefits} marked />
                <LeadQuestions />
                <TextGroup label="Экран благодарности" items={[thanksMessage, thanksCta]} />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>

        <section className="lg:col-span-2">
          <Tabs defaultValue="active">
            <TabsList>
              <TabsTrigger value="active">Активные креативы</TabsTrigger>
              <TabsTrigger value="archive">Архив генераций</TabsTrigger>
            </TabsList>
            <TabsContent value="active">
              <ActiveCreatives generation={activeGeneration} onZoom={setZoom} />
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
      {zoom ? <ZoomImage src={zoom} onClose={() => setZoom(null)} /> : null}
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата неизвестна";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", year: "numeric" }).format(date);
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

function LeadQuestions() {
  return (
    <div className="grid gap-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">Вопросы</p>
      <ul className="grid gap-3">
        {leadQuestions.map((question) => (
          <li key={question.prompt} className="grid gap-2">
            <CopyRow text={question.prompt} />
            <div className="flex flex-wrap gap-2">
              {question.answers.map((answer) => (
                <Badge key={answer} variant="outline" className="text-zinc-400">
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

function LinkBack() {
  return (
    <Link href="/ads" className="text-sm text-zinc-400 transition-colors hover:text-white">
      ← Все кампании
    </Link>
  );
}

function TextGroup({ label, items, marked = false }: { label: string; items: string[]; marked?: boolean }) {
  return (
    <div className="grid gap-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">{label}</p>
      <ul className="grid gap-2">
        {items.map((item, index) => (
          <li key={`${label}-${index}`}>
            <CopyRow text={item} marked={marked} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyRow({ text, marked = false }: { text: string; marked?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800 bg-black/40 px-3 py-2">
      <p className="flex gap-2 text-sm leading-6 text-zinc-200">
        {marked ? <Check className="mt-1 size-3.5 shrink-0 text-zinc-400" /> : null}
        <span>{text}</span>
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 shrink-0 px-2 text-zinc-400"
        onClick={() => copyText(text)}
      >
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
