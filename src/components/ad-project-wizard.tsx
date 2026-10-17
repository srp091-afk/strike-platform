"use client";

import { Link as LinkIcon } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { acceptUploadedTable, createAdCampaign, type CreateAdProjectState, type UploadedTableState } from "@/actions/ads-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import { creativeTemplates, templateCategories } from "@/lib/creative-templates";
import { cn } from "@/lib/utils";

const openingMessage = "Привет! Что мы будем продвигать и в каком регионе?";

const uploadedInitial: UploadedTableState = { error: null, summary: null, raw: null };
const createInitial: CreateAdProjectState = { error: null };

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

type Stage = "intake" | "style";
type BriefSource = "chat" | "table";

export function AdProjectWizard() {
  const [stage, setStage] = useState<Stage>("intake");
  const [source, setSource] = useState<BriefSource>("chat");
  const [briefSummary, setBriefSummary] = useState("");
  const [tableRaw, setTableRaw] = useState<unknown>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: openingMessage }]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof templateCategories)[number]>("Все");
  const [createState, createAction, creating] = useActionState(createAdCampaign, createInitial);
  const threadRef = useRef<HTMLDivElement>(null);

  const acceptTable = useCallback((summary: string, raw: unknown) => {
    setSource("table");
    setBriefSummary(summary);
    setTableRaw(raw);
    setStage("style");
  }, []);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }, [messages, sending, stage]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setDraft("");
    setSending(true);
    setChatError(null);

    try {
      const response = await fetch("/api/brief-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const payload = (await response.json()) as { error?: string; complete?: boolean; brief_summary?: string; reply?: string };
      if (!response.ok) {
        setChatError(payload.error || "Не удалось отправить сообщение.");
        return;
      }
      if (payload.complete === true && typeof payload.brief_summary === "string" && payload.brief_summary.trim()) {
        setSource("chat");
        setBriefSummary(payload.brief_summary.trim());
        setTableRaw(null);
        setStage("style");
        return;
      }
      if (typeof payload.reply === "string" && payload.reply.trim()) {
        setMessages((current) => [...current, { role: "assistant", content: payload.reply!.trim() }]);
        return;
      }
      setChatError("Модель вернула пустой ответ.");
    } catch {
      setChatError("Не удалось связаться с сервером.");
    } finally {
      setSending(false);
    }
  }

  const visibleTemplates =
    category === "Все" ? creativeTemplates : creativeTemplates.filter((template) => template.category === category);
  const selected = creativeTemplates.find((template) => template.id === selectedTemplate) ?? null;

  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <Card className="grid gap-6 border-zinc-800 bg-zinc-900/40 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
            Шаг {stage === "intake" ? "1" : "2"} из 2
          </p>
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="h-1.5 w-10 rounded-full bg-white" />
            <span className={`h-1.5 w-10 rounded-full ${stage === "style" ? "bg-white" : "bg-zinc-800"}`} />
          </div>
        </div>

        {stage === "intake" ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="grid gap-1">
                <h2 className="font-heading text-lg font-semibold text-white">Сбор фактов</h2>
                <p className="text-sm text-zinc-400">ИИ задаст вопросы по одному или примет готовую таблицу.</p>
              </div>
              <Button type="button" variant="outline" onClick={() => toast.success("Ссылка скопирована (в разработке)")}>
                <LinkIcon className="size-4" />
                Отправить ссылку клиенту
              </Button>
            </div>

            <Tabs defaultValue="brief">
              <TabsList>
                <TabsTrigger value="brief">Пройти AI-бриф</TabsTrigger>
                <TabsTrigger value="table">Загрузить готовую таблицу</TabsTrigger>
              </TabsList>
              <TabsContent value="brief" className="grid gap-3">
                <div
                  ref={threadRef}
                  className="flex h-[400px] flex-col gap-3 overflow-y-auto rounded-xl border border-zinc-800 bg-black/40 p-4"
                  aria-live="polite"
                >
                  {messages.map((message, index) => (
                    <p
                      key={`${message.role}-${index}`}
                      className={cn(
                        "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-6 text-zinc-200",
                        message.role === "assistant" ? "self-start bg-zinc-800/50" : "self-end bg-zinc-700",
                      )}
                    >
                      {message.content}
                    </p>
                  ))}
                  {sending ? (
                    <p className="self-start rounded-2xl bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200">…</p>
                  ) : null}
                </div>
                {chatError ? (
                  <Alert variant="destructive">
                    <AlertTitle>Ответ не отправлен</AlertTitle>
                    <AlertDescription>{chatError}</AlertDescription>
                  </Alert>
                ) : null}
                <form className="flex gap-2" onSubmit={sendMessage}>
                  <Input
                    value={draft}
                    placeholder="Цифры и факты, без общих фраз"
                    disabled={sending}
                    autoComplete="off"
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <Button type="submit" disabled={sending || !draft.trim()}>
                    Отправить
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="table">
                <TableUpload onAccepted={acceptTable} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <form action={createAction} className="grid gap-5">
            <input type="hidden" name="brief_summary" value={briefSummary} />
            <input type="hidden" name="template_id" value={selectedTemplate ?? ""} />
            <input type="hidden" name="source" value={source} />
            {source === "table" ? <input type="hidden" name="raw_data" value={JSON.stringify(tableRaw)} /> : null}

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="grid max-w-2xl gap-1">
                <h2 className="font-heading text-lg font-semibold text-white">Выберите визуальный стиль</h2>
                <p className="line-clamp-3 text-sm leading-6 text-zinc-400">{briefSummary}</p>
              </div>
              <Button type="button" variant="outline" onClick={() => setStage("intake")}>
                Назад
              </Button>
            </div>

            {createState.error ? (
              <Alert variant="destructive">
                <AlertTitle>Проект не создан</AlertTitle>
                <AlertDescription>{createState.error}</AlertDescription>
              </Alert>
            ) : null}

            <Tabs value={category} onValueChange={(value) => setCategory(value as (typeof templateCategories)[number])}>
              <TabsList className="h-auto flex-wrap">
                {templateCategories.map((item) => (
                  <TabsTrigger key={item} value={item} className="h-auto min-h-8 flex-none px-3 py-1">
                    {item}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {visibleTemplates.map((template) => {
                const active = template.id === selectedTemplate;
                return (
                  <button
                    key={template.id}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      "overflow-hidden rounded-2xl border-2 bg-zinc-900/40 text-left",
                      active ? "border-white" : "border-zinc-800",
                    )}
                    onClick={() => setSelectedTemplate(template.id)}
                  >
                    <img src={template.preview_url} alt="" className="aspect-[4/5] w-full object-cover" />
                    <span className="block px-3 py-3 text-sm font-medium text-white">{template.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={!selected || creating}>
                {creating ? "Сохраняем кампанию" : "Сгенерировать кампанию"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

function TableUpload({ onAccepted }: { onAccepted: (summary: string, raw: unknown) => void }) {
  const [state, action, pending] = useActionState(acceptUploadedTable, uploadedInitial);
  const applied = useRef<string | null>(null);

  useEffect(() => {
    if (!state.summary || applied.current === state.summary) return;
    applied.current = state.summary;
    onAccepted(state.summary, state.raw);
  }, [onAccepted, state.raw, state.summary]);

  return (
    <form action={action} className="grid gap-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertTitle>Таблица не принята</AlertTitle>
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <label className="grid gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Файл .xlsx или .csv</span>
        <Input
          name="file"
          type="file"
          accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        />
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Проверяем таблицу" : "Продолжить"}
        </Button>
      </div>
    </form>
  );
}
