import type { Metadata } from "next";

import { IndexMark, PageFrame } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Чаты",
};

const threads = [
  { index: "01", name: "Алексей", channel: "WhatsApp", preview: "Нужен расчёт на завтра" },
  { index: "02", name: "Марина", channel: "Telegram", preview: "Можно короче, по пунктам" },
  { index: "03", name: "studio.north", channel: "Instagram", preview: "Есть слот на этой неделе?" },
];

const messages = [
  { role: "user" as const, text: "Нужен расчёт на завтра. Можно без длинных вступлений." },
  { role: "assistant" as const, index: "01", text: "Принял. Считаю окно на завтра, 10:00–18:00." },
  {
    role: "assistant" as const,
    index: "02",
    text: "Два слота свободны: 11:30 и 16:00. Какой фиксируем?",
  },
];

export default function ChatsPage() {
  return (
    <PageFrame
      eyebrow="Диалоги"
      title="Чаты"
      description="Макет переписки. Сообщения — прямоугольные блоки. Ответ ассистента уже показан двумя кусками, как после разреза по пустой строке."
    >
      <div className="grid min-h-[640px] min-w-0 grid-cols-1 border border-black lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <aside className="min-w-0 border-b border-black lg:border-r lg:border-b-0">
          <p className="border-b border-black px-4 py-3 font-display text-xs font-bold uppercase tracking-[0.22em]">
            Входящие
          </p>
          <ul>
            {threads.map((thread, index) => (
              <li
                key={thread.index}
                className={cn(
                  "flex gap-3 border-b border-black px-4 py-4",
                  index === 0 && "bg-black text-white",
                )}
              >
                <IndexMark value={thread.index} />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-bold uppercase tracking-wide">
                    {thread.name}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-[11px] uppercase tracking-[0.16em]",
                      index === 0 ? "text-zinc-400" : "text-zinc-500",
                    )}
                  >
                    {thread.channel}
                  </span>
                  <span
                    className={cn(
                      "mt-2 block truncate text-sm",
                      index === 0 ? "text-zinc-200" : "text-zinc-700",
                    )}
                  >
                    {thread.preview}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex min-h-[520px] min-w-0 flex-col">
          <header className="flex items-center justify-between border-b border-black px-4 py-3">
            <div>
              <h2 className="text-2xl">Алексей</h2>
              <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">WhatsApp</p>
            </div>
            <span className="bg-strike px-2 py-1 font-display text-[11px] font-bold uppercase tracking-[0.16em] text-white">
              Live
            </span>
          </header>

          <div className="flex flex-1 flex-col gap-3 bg-zinc-100 p-4">
            {messages.map((message) => {
              const outbound = message.role === "assistant";

              return (
                <div
                  key={`${message.role}-${message.text}`}
                  className={cn(
                    "max-w-[78%] border border-black px-4 py-3",
                    outbound ? "ml-auto bg-black text-white" : "mr-auto bg-white text-black",
                  )}
                >
                  {message.index ? (
                    <span className="mb-2 inline-grid h-6 min-w-6 place-items-center bg-strike px-1 font-display text-[11px] font-bold text-white">
                      {message.index}
                    </span>
                  ) : null}
                  <p className="text-sm leading-6">{message.text}</p>
                </div>
              );
            })}
          </div>

          <div className="flex min-w-0 border-t border-black">
            <input
              className="w-0 min-w-0 flex-1 bg-white px-4 py-4 text-sm outline-none"
              placeholder="Сообщение"
              name="draft"
            />
            <Button type="button" className="h-auto shrink-0 px-4 sm:px-6">
              Отправить
            </Button>
          </div>
        </section>
      </div>
    </PageFrame>
  );
}
