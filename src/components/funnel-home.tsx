"use client";

import { Bot, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { LandingRecord } from "@/lib/landing-types";

const chips = [
  { label: "🛠 Ремонт квартир", prompt: "Нужен сайт для студии ремонта квартир под ключ в премиальном сегменте. Прогреть собственника и привести в чат с ИИ." },
  { label: "💅 Бьюти-сфера", prompt: "Нужен сайт для премиальной бьюти-студии: уход, запись и мягкий прогрев в диалог с администратором-ИИ." },
  { label: "🏢 B2B Услуги", prompt: "Нужен сайт для B2B-агентства, которое приводит клиентов строительным компаниям. Сильный оффер и перевод в чат." },
  { label: "🏡 Виллы в Дубае", prompt: "Нужен сайт для продажи и отделки вилл в Дубае. Дорогой тон, конкретный оффер и перевод посетителя в ИИ-чат." },
];

export function FunnelHome({
  landings,
  loadError,
}: {
  landings: LandingRecord[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  function openBuilder(text: string) {
    const value = text.trim();
    if (!value) return;
    router.push(`/funnels/builder?prompt=${encodeURIComponent(value)}`);
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-6 py-16">
      <section className="flex flex-col items-center pt-10 text-center sm:pt-16">
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Воронки</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-zinc-950 sm:text-6xl">
          Что будем запускать сегодня?
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-500">
          Опишите нишу. Конструктор соберёт премиальный лендинг и виджет чата с вашим агентом.
        </p>

        <form
          className="mt-10 w-full max-w-3xl rounded-[28px] border border-zinc-200/80 bg-white p-3 text-left shadow-[0_20px_60px_-36px_rgba(0,0,0,0.45)] transition-shadow duration-300 focus-within:border-rose-200 focus-within:shadow-[0_0_0_1px_rgba(225,29,72,0.28),0_0_48px_-12px_rgba(225,29,72,0.55)]"
          onSubmit={(event) => {
            event.preventDefault();
            openBuilder(prompt);
          }}
        >
          <textarea
            value={prompt}
            rows={4}
            placeholder="Опишите вашу нишу, например: Нужен сайт для продажи вилл в Дубае..."
            className="w-full resize-none bg-transparent px-4 py-3 text-base text-zinc-900 outline-none placeholder:text-zinc-400"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                openBuilder(prompt);
              }
            }}
          />
          <div className="flex justify-end px-2 pb-1">
            <Button type="submit" disabled={!prompt.trim()}>
              <Sparkles className="size-4" />
              Сгенерировать
            </Button>
          </div>
        </form>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm text-zinc-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md"
              onClick={() => setPrompt(chip.prompt)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </section>

      <section className="mt-20">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl font-semibold">Мои воронки</h2>
          <p className="text-sm text-zinc-400">{landings.length}</p>
        </div>
        {loadError ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
        ) : null}
        {landings.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500">
            Пока нет воронок. Опишите первую в поле выше.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {landings.map((landing) => (
              <li key={landing.id}>
                <button
                  type="button"
                  className="group flex h-full w-full flex-col rounded-2xl border border-zinc-200/80 bg-white p-6 text-left shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]"
                  onClick={() => router.push(`/funnels/builder?id=${landing.id}`)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                      {landing.document.status === "published" ? "Опубликован" : "Черновик"}
                    </span>
                    <span className="text-xs text-zinc-400">{formatDate(landing.createdAt)}</span>
                  </div>
                  <p className="mt-4 font-heading text-xl font-semibold tracking-tight text-zinc-900">{landing.title}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-500">
                    {landing.subtitle || "Лендинг без подзаголовка"}
                  </p>
                  <p className="mt-5 flex items-center gap-2 text-sm text-zinc-600">
                    <span className="grid size-8 place-items-center rounded-xl bg-red-50 text-red-600">
                      <Bot className="size-4" />
                    </span>
                    {landing.agentName ?? "Агент не выбран"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date);
}
