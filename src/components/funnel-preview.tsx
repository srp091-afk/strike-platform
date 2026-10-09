"use client";

import { useMemo, useState, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";

import {
  buildWhatsAppLink,
  buildWhatsAppText,
  type FunnelStyle,
  type FunnelWidgets,
} from "@/lib/funnel-templates";
import { cn } from "@/lib/utils";

type Picks = {
  style?: string;
  budget?: string;
  area?: string;
};

export function FunnelPreview({
  agentName,
  welcome,
  widgets,
  styles,
  budgets,
  areas,
  phone,
  messageTemplate,
  variant = "device",
}: {
  agentName: string;
  welcome: string;
  widgets: FunnelWidgets;
  styles: FunnelStyle[];
  budgets: string[];
  areas: string[];
  phone: string;
  messageTemplate: string;
  variant?: "device" | "page";
}) {
  const [picks, setPicks] = useState<Picks>({});
  const [revealed, setRevealed] = useState(false);

  const text = useMemo(
    () => buildWhatsAppText(messageTemplate, widgets, picks),
    [messageTemplate, widgets, picks],
  );
  const link = useMemo(() => buildWhatsAppLink(phone, text), [phone, text]);

  const screen = (
    <div className={cn("flex min-h-[36rem] flex-col bg-[#F8FAFC]", variant === "page" && "min-h-[40rem]")}>
      <div className="border-b border-zinc-200/80 bg-white px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Диалог</p>
        <p className="font-heading text-sm font-semibold text-zinc-900">{agentName}</p>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        <p className="max-w-[16rem] rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-sm leading-5 text-zinc-800 shadow-sm">
          {welcome}
        </p>

        {widgets.carousel ? (
          <WidgetBlock title="Какой стиль ближе?">
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {styles.map((style) => {
                const selected = picks.style === style.name;
                return (
                  <button
                    key={style.id}
                    type="button"
                    onClick={() => setPicks((current) => ({ ...current, style: style.name }))}
                    className={cn(
                      "w-28 shrink-0 overflow-hidden rounded-xl text-left shadow-sm transition-all",
                      selected ? "ring-2 ring-strike" : "ring-1 ring-zinc-200/80",
                    )}
                  >
                    <span className={cn("block h-16", style.tone)} />
                    <span className="block bg-white px-2.5 py-2">
                      <span className="block text-xs font-semibold text-zinc-900">{style.name}</span>
                      <span className={cn("mt-1 block text-[10px] font-semibold", selected ? "text-strike" : "text-zinc-400")}>
                        {selected ? "Выбрано" : "Выбрать"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </WidgetBlock>
        ) : null}

        {widgets.budget ? (
          <WidgetBlock title="Какой бюджет рассматриваете?">
            <div className="flex flex-wrap gap-2">
              {budgets.map((budget) => (
                <Chip
                  key={budget}
                  selected={picks.budget === budget}
                  onClick={() => setPicks((current) => ({ ...current, budget }))}
                >
                  {budget}
                </Chip>
              ))}
            </div>
          </WidgetBlock>
        ) : null}

        {widgets.area ? (
          <WidgetBlock title="Какая площадь объекта?">
            <div className="flex flex-wrap gap-2">
              {areas.map((area) => (
                <Chip
                  key={area}
                  selected={picks.area === area}
                  onClick={() => setPicks((current) => ({ ...current, area }))}
                >
                  {area}
                </Chip>
              ))}
            </div>
          </WidgetBlock>
        ) : null}
      </div>

      <div className="border-t border-zinc-200/80 bg-white p-3">
        <button
          type="button"
          disabled={!link}
          onClick={() => setRevealed(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-strike px-3 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-strike-dark disabled:opacity-40"
        >
          <MessageCircle className="size-4" strokeWidth={2} />
          Получить черновой расчёт в WhatsApp
        </button>
        {revealed && link ? (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="mt-2 block break-all rounded-xl bg-zinc-50 px-3 py-2 text-[11px] leading-4 text-zinc-600"
          >
            {link}
          </a>
        ) : null}
      </div>
    </div>
  );

  if (variant === "page") {
    return (
      <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)]">
        {screen}
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[22rem]">
      <div className="rounded-[2.4rem] bg-zinc-900 p-2.5 shadow-[0_24px_50px_-24px_rgba(0,0,0,0.45)]">
        <div className="overflow-hidden rounded-[1.9rem] bg-white">
          <div className="flex justify-center bg-[#F8FAFC] pt-2.5">
            <span className="h-5 w-24 rounded-full bg-zinc-900" />
          </div>
          {screen}
        </div>
      </div>
    </div>
  );
}

function WidgetBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-zinc-500">{title}</p>
      {children}
    </div>
  );
}

function Chip({
  selected,
  children,
  onClick,
}: {
  selected: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
        selected ? "bg-zinc-900 text-white" : "bg-white text-zinc-700 shadow-sm ring-1 ring-zinc-200",
      )}
    >
      {children}
    </button>
  );
}
