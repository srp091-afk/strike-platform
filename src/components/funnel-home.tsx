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
        <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Сайты</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          Что будем запускать сегодня?
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-400">
          Опишите нишу. Конструктор соберёт премиальный лендинг и виджет чата с вашим агентом.
        </p>

        <form
          className="mt-10 w-full max-w-3xl rounded-[28px] border border-zinc-800/50 bg-zinc-900/50 p-3 text-left backdrop-blur-md transition-colors duration-300 focus-within:border-white"
          onSubmit={(event) => {
            event.preventDefault();
            openBuilder(prompt);
          }}
        >
          <textarea
            value={prompt}
            rows={4}
            placeholder="Опишите вашу нишу, например: Нужен сайт для продажи вилл в Дубае..."
            className="w-full resize-none bg-transparent px-4 py-3 text-base text-white outline-none placeholder:text-zinc-600"
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
              className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 transition-colors duration-200 hover:border-zinc-600 hover:text-white"
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
          <p className="mt-4 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">{loadError}</p>
        ) : null}
        {landings.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/50 px-6 py-12 text-center text-sm text-zinc-400">
            Пока нет воронок. Опишите первую в поле выше.
          </p>
        ) : (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {landings.map((landing) => (
              <li key={landing.id}>
                <button
                  type="button"
                  className="group flex h-full w-full flex-col rounded-2xl border border-zinc-800/50 bg-zinc-900/50 p-6 text-left backdrop-blur-md transition-colors duration-200 hover:border-zinc-600"
                  onClick={() => router.push(`/funnels/builder?id=${landing.id}`)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full border border-zinc-800 bg-black px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                      {landing.document.status === "published" ? "Опубликован" : "Черновик"}
                    </span>
                    <span className="text-xs text-zinc-400">{formatDate(landing.createdAt)}</span>
                  </div>
                  <p className="mt-4 font-heading text-xl font-semibold tracking-tight text-white">{landing.title}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">
                    {landing.subtitle || "Лендинг без подзаголовка"}
                  </p>
                  <p className="mt-5 flex items-center gap-2 text-sm text-zinc-400">
                    <span className="grid size-8 place-items-center rounded-xl border border-zinc-800 bg-black text-white">
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
