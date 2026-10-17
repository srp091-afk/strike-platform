"use client";

import { ArrowUp, Bot, Link as LinkIcon, Mic } from "lucide-react";

import { AdStyleStudio } from "@/components/ad-style-studio";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";

import { acceptUploadedTable, createAdCampaign, type CreateAdProjectState, type UploadedTableState } from "@/actions/ads-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toaster";
import type { AdFormattedBrief } from "@/lib/ad-types";
import { cn } from "@/lib/utils";

const openingMessage = "Привет! Что мы будем продвигать и в каком регионе?";

const uploadedInitial: UploadedTableState = { error: null, summary: null, raw: null };
const createInitial: CreateAdProjectState = { error: null, projectId: null };

type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

type Stage = "intake" | "style";
type BriefSource = "chat" | "table";

type StyleTemplate = {
  id: string;
  name: string;
  category: string;
  preview_url: string;
};

export function AdProjectWizard({ templates }: { templates: StyleTemplate[] }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("intake");
  const [source, setSource] = useState<BriefSource>("chat");
  const [briefSummary, setBriefSummary] = useState("");
  const [tableRaw, setTableRaw] = useState<unknown>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: "assistant", content: openingMessage }]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionClicks, setSuggestionClicks] = useState(0);
  const [listening, setListening] = useState(false);
  const [strategyJson, setStrategyJson] = useState("");
  const [strategyPending, setStrategyPending] = useState(false);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [formattedBrief, setFormattedBrief] = useState<AdFormattedBrief | null>(null);
  const [formattedPending, setFormattedPending] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const sendingRef = useRef(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const suggestionRequest = useRef(0);
  const strategyRequest = useRef<string | null>(null);
  const formatRequest = useRef<string | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const draftRef = useRef("");
  draftRef.current = draft;

  const acceptTable = useCallback((summary: string, raw: unknown) => {
    setSource("table");
    setBriefSummary(summary);
    setTableRaw(raw);
    setFormattedBrief(null);
    setStage("style");
  }, []);

  useEffect(() => {
    if (messages.length <= 1 && !sending) return;
    threadRef.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [messages, sending, suggestions, suggestionsLoading, stage]);

  useEffect(() => {
    if (stage !== "style" || briefSummary.length < 12) return;
    if (formatRequest.current === briefSummary) return;
    formatRequest.current = briefSummary;
    const summary = briefSummary;
    let active = true;
    setFormattedPending(true);
    setFormattedBrief(null);

    void fetch("/api/format-brief", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief_summary: summary }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as Partial<AdFormattedBrief> & { error?: string };
        if (!active || formatRequest.current !== summary) return;
        if (!response.ok || !isFormattedBrief(payload)) {
          setFormattedBrief(null);
          return;
        }
        setFormattedBrief({
          product: payload.product.trim(),
          audience: payload.audience.trim(),
          key_advantages: payload.key_advantages.trim(),
          offer: payload.offer.trim(),
        });
      })
      .catch(() => {
        if (!active || formatRequest.current !== summary) return;
        setFormattedBrief(null);
      })
      .finally(() => {
        if (formatRequest.current === summary) setFormattedPending(false);
      });

    return () => {
      active = false;
    };
  }, [stage, briefSummary]);

  useEffect(() => {
    if (stage !== "style" || briefSummary.length < 12) return;
    if (formattedPending) return;
    const strategyKey = `${briefSummary}::${formattedBrief?.key_advantages ?? ""}`;
    if (strategyRequest.current === strategyKey) return;
    strategyRequest.current = strategyKey;
    const summary = briefSummary;
    const briefCard = formattedBrief;
    let active = true;
    setStrategyPending(true);
    setStrategyJson("");
    setStrategyError(null);

    void fetch("/api/generate-strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief_summary: summary, formatted_brief: briefCard }),
    })
      .then(async (response) => {
        const payload = (await response.json()) as { error?: string };
        if (!active || strategyRequest.current !== strategyKey) return;
        if (!response.ok || !isStrategyPayload(payload)) {
          setStrategyJson("");
          setStrategyError(typeof payload.error === "string" && payload.error.trim() ? payload.error : "Не удалось собрать стратегию.");
          return;
        }
        setStrategyError(null);
        setStrategyJson(JSON.stringify(payload));
      })
      .catch(() => {
        if (!active || strategyRequest.current !== strategyKey) return;
        setStrategyJson("");
        setStrategyError("Не удалось связаться с сервером.");
      })
      .finally(() => {
        if (strategyRequest.current === strategyKey) setStrategyPending(false);
      });

    return () => {
      active = false;
    };
  }, [stage, briefSummary, formattedBrief, formattedPending]);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  async function submitText(text: string) {
    const value = text.trim();
    if (!value || sendingRef.current) return;

    recognitionRef.current?.stop();
    suggestionRequest.current += 1;
    const next = [...messages, { role: "user" as const, content: value }];
    sendingRef.current = true;
    setMessages(next);
    setDraft("");
    setSuggestions([]);
    setSuggestionsLoading(false);
    setSuggestionClicks(0);
    setSending(true);
    setChatError(null);

    try {
      const response = await fetch("/api/brief-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        suggestions?: unknown;
        status?: string;
        brief_summary?: string | null;
      };
      if (!response.ok) {
        setChatError(payload.error || "Не удалось отправить сообщение.");
        return;
      }
      if (payload.status === "complete" && typeof payload.brief_summary === "string" && payload.brief_summary.trim()) {
        setSource("chat");
        setBriefSummary(payload.brief_summary.trim());
        setTableRaw(null);
        setFormattedBrief(null);
        setStage("style");
        return;
      }
      const message = typeof payload.message === "string" ? payload.message.trim() : "";
      if (!message) {
        setChatError("Модель вернула пустой ответ.");
        return;
      }
      setMessages((current) => [...current, { role: "assistant", content: message }]);
      setSuggestions(readSuggestions(payload.suggestions));
    } catch {
      setChatError("Не удалось связаться с сервером.");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitText(draft);
  }

  function appendSuggestion(suggestion: string) {
    const nextDraft = joinDraft(draft, suggestion);
    const nextClicks = suggestionClicks + 1;
    setDraft(nextDraft);
    setSuggestionClicks(nextClicks);
    if (suggestionClicks >= 10) return;
    void refreshSuggestions(nextDraft);
  }

  async function refreshSuggestions(draftText: string) {
    const requestId = suggestionRequest.current + 1;
    suggestionRequest.current = requestId;
    setSuggestionsLoading(true);
    try {
      const response = await fetch("/api/brief-chat/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: messages, draftText }),
      });
      const payload = (await response.json()) as { suggestions?: unknown };
      if (requestId !== suggestionRequest.current) return;
      setSuggestions(response.ok ? readSuggestions(payload.suggestions) : []);
    } catch {
      if (requestId !== suggestionRequest.current) return;
      setSuggestions([]);
    } finally {
      if (requestId === suggestionRequest.current) setSuggestionsLoading(false);
    }
  }

  async function submitCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || generating || strategyPending) return;

    const formData = new FormData(event.currentTarget);
    setCreateError(null);
    setCreating(true);

    let projectId = "";
    try {
      const created = await createAdCampaign(createInitial, formData);
      if (created.error || !created.projectId) {
        setCreateError(created.error ?? "Не удалось создать проект.");
        setCreating(false);
        return;
      }
      projectId = created.projectId;
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Не удалось создать проект.");
      setCreating(false);
      return;
    }

    setCreating(false);
    setGenerating(true);

    const creativesCount = Number(String(formData.get("creatives_count") ?? "").trim());
    const creativeLanguage = String(formData.get("creative_language") ?? "").trim();
    const styleId = String(formData.get("style_key") ?? "").trim();

    try {
      const response = await fetch("/api/generate-creatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, creativesCount, creativeLanguage, styleId }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast.error(
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Не удалось сгенерировать креативы.",
        );
        router.push(`/ads/${projectId}`);
        return;
      }
      router.push(`/ads/${projectId}`);
    } catch {
      toast.error("Не удалось связаться с сервером генерации.");
      router.push(`/ads/${projectId}`);
    }
  }

  function toggleVoice() {
    const Recognition = speechRecognition();
    if (!Recognition) {
      toast.error("Голосовой ввод не поддерживается в этом браузере.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new Recognition();
    const base = draftRef.current.trim();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let spoken = "";
      for (let index = 0; index < event.results.length; index += 1) {
        spoken += event.results[index]?.[0]?.transcript ?? "";
      }
      setDraft(base ? `${base} ${spoken.trim()}` : spoken.trim());
    };
    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === "aborted" || event.error === "no-speech") return;
      toast.error(event.error === "not-allowed" ? "Нет доступа к микрофону." : "Не удалось распознать речь.");
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
      toast.error("Не удалось включить микрофон.");
    }
  }

  return (
    <div className={cn("mx-auto w-full", stage === "style" ? "max-w-7xl" : "max-w-5xl")}>
      <Card className="grid gap-5 border-zinc-800 bg-zinc-900/40 p-4 sm:p-6">
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
          <div className="grid min-w-0 gap-5">
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

            <Tabs defaultValue="brief" className="min-w-0">
              <TabsList>
                <TabsTrigger value="brief">Пройти AI-бриф</TabsTrigger>
                <TabsTrigger value="table">Загрузить готовую таблицу</TabsTrigger>
              </TabsList>
              <TabsContent value="brief" className="min-w-0">
                <div className="min-w-0 overflow-x-hidden rounded-xl border border-zinc-800 bg-black">
                  <div ref={threadRef} className="flex min-w-0 flex-col gap-6 px-6 pt-6" aria-live="polite">
                    {messages.map((message, index) =>
                      message.role === "assistant" ? (
                        <div key={`${message.role}-${index}`} className="flex items-start gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-white shadow-sm">
                            <Bot className="size-4" />
                          </span>
                          <div className="min-w-0 rounded-2xl rounded-tl-sm border border-zinc-800/50 bg-zinc-900/40 px-5 py-4 backdrop-blur-sm">
                            <p className="text-sm leading-relaxed tracking-wide text-zinc-100">{message.content}</p>
                          </div>
                        </div>
                      ) : (
                        <p
                          key={`${message.role}-${index}`}
                          className="max-w-[85%] self-end rounded-3xl rounded-tr-sm bg-zinc-800 px-5 py-3 text-sm leading-6 text-white"
                        >
                          {message.content}
                        </p>
                      ),
                    )}
                    {sending ? (
                      <div className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-600 bg-zinc-800 text-white shadow-sm">
                          <Bot className="size-4" />
                        </span>
                        <div
                          className="flex items-center gap-1.5 rounded-xl border border-zinc-800/50 bg-zinc-900/40 px-2 py-1 shadow-[0_0_20px_rgba(139,92,246,0.05)] backdrop-blur-sm animate-pulse-subtle"
                          role="status"
                          aria-label="ИИ думает"
                        >
                          {["0ms", "150ms", "300ms"].map((delay) => (
                            <span
                              key={delay}
                              className="h-1.5 w-1.5 animate-typing rounded-full bg-zinc-400"
                              style={{ animationDelay: delay }}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <SuggestionRow
                        loading={suggestionsLoading}
                        suggestions={suggestions}
                        onPick={appendSuggestion}
                      />
                    )}
                  </div>
                  {chatError ? (
                    <Alert variant="destructive" className="mx-4 mt-4">
                      <AlertTitle>Ответ не отправлен</AlertTitle>
                      <AlertDescription>{chatError}</AlertDescription>
                    </Alert>
                  ) : null}
                  <form className="p-4" onSubmit={sendMessage}>
                    <div className="relative">
                      <Textarea
                        value={draft}
                        rows={2}
                        placeholder="Цифры и факты, без общих фраз"
                        disabled={sending}
                        autoComplete="off"
                        className="max-h-28 min-h-14 resize-none rounded-xl border-zinc-700/50 bg-zinc-900/80 px-4 py-3 pr-28 text-white shadow-2xl backdrop-blur-xl transition-colors placeholder:text-zinc-500 focus:border-zinc-500 focus-visible:border-zinc-500 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        onChange={(event) => setDraft(event.target.value)}
                      />
                      <div className="absolute inset-y-0 right-3 flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={listening ? "Остановить запись" : "Голосовой ввод"}
                          aria-pressed={listening}
                          className={cn(
                            "grid h-8 w-8 place-items-center text-zinc-400 transition-colors hover:text-white",
                            listening && "animate-pulse text-red-500",
                          )}
                          onClick={toggleVoice}
                        >
                          <Mic className="size-4" />
                        </button>
                        <button
                          type="submit"
                          aria-label="Отправить"
                          disabled={sending || !draft.trim()}
                          className="inline-flex h-8 items-center justify-center rounded-md bg-white px-3 text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ArrowUp className="size-4" />
                        </button>
                      </div>
                    </div>
                  </form>
                </div>
              </TabsContent>
              <TabsContent value="table">
                <TableUpload onAccepted={acceptTable} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <form onSubmit={submitCampaign} className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
            <input type="hidden" name="brief_summary" value={briefSummary} />
            <input type="hidden" name="source" value={source} />
            {strategyJson ? <input type="hidden" name="strategy_data" value={strategyJson} /> : null}
            {formattedBrief ? <input type="hidden" name="formatted_brief" value={JSON.stringify(formattedBrief)} /> : null}
            {source === "table" ? <input type="hidden" name="raw_data" value={JSON.stringify(tableRaw)} /> : null}
            <AdStyleStudio
              formattedBrief={formattedBrief}
              formattedPending={formattedPending}
              strategyPending={strategyPending}
              strategyError={strategyError}
              createError={createError}
              templates={templates}
              creating={creating}
              generating={generating}
              onBack={() => setStage("intake")}
            />
          </form>
        )}
      </Card>
    </div>
  );
}

function isStrategyPayload(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return Boolean(record.strategy && record.creatives && record.facebook_setup && record.lead_form);
}

function isFormattedBrief(value: unknown): value is AdFormattedBrief {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.product === "string" &&
    row.product.trim().length > 0 &&
    typeof row.audience === "string" &&
    row.audience.trim().length > 0 &&
    typeof row.key_advantages === "string" &&
    row.key_advantages.trim().length > 0 &&
    typeof row.offer === "string" &&
    row.offer.trim().length > 0
  );
}

function readSuggestions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function joinDraft(current: string, addition: string) {
  const base = current.trim().replace(/,\s*$/, "");
  const extra = addition.trim();
  if (!extra) return base;
  if (!base) return extra;
  return `${base}, ${extra}`;
}

function SuggestionRow({
  loading,
  suggestions,
  onPick,
}: {
  loading: boolean;
  suggestions: string[];
  onPick: (suggestion: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);
  const dragged = useRef(false);

  useEffect(() => {
    const row = scrollRef.current;
    if (!row) return;
    const onWheel = (event: WheelEvent) => {
      if (row.scrollWidth <= row.clientWidth + 1) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      event.preventDefault();
      row.scrollLeft += event.deltaY;
    };
    row.addEventListener("wheel", onWheel, { passive: false });
    return () => row.removeEventListener("wheel", onWheel);
  }, [loading, suggestions]);

  function onMouseDown(event: MouseEvent<HTMLDivElement>) {
    const row = scrollRef.current;
    if (!row) return;
    isDragging.current = true;
    dragged.current = false;
    startX.current = event.pageX - row.offsetLeft;
    scrollLeft.current = row.scrollLeft;
  }

  function stopDragging() {
    isDragging.current = false;
  }

  function onMouseMove(event: MouseEvent<HTMLDivElement>) {
    const row = scrollRef.current;
    if (!isDragging.current || !row) return;
    event.preventDefault();
    const x = event.pageX - row.offsetLeft;
    const walk = x - startX.current;
    if (Math.abs(walk) > 5) dragged.current = true;
    row.scrollLeft = scrollLeft.current - walk;
  }

  function onChipClick(suggestion: string) {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onPick(suggestion);
  }

  if (!loading && suggestions.length === 0) return null;

  return (
    <div
      ref={scrollRef}
      className="flex w-full min-w-0 max-w-full cursor-grab gap-2 overflow-x-auto pb-2 pl-11 select-none [-ms-overflow-style:none] [scrollbar-width:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
      onMouseDown={onMouseDown}
      onMouseLeave={stopDragging}
      onMouseUp={stopDragging}
      onMouseMove={onMouseMove}
    >
      {loading
        ? [0, 1, 2].map((item) => (
            <span key={item} className="h-9 w-28 shrink-0 animate-pulse rounded-xl bg-zinc-800" />
          ))
        : suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion}-${index}`}
              type="button"
              className="shrink-0 cursor-grab rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2 text-sm whitespace-nowrap text-zinc-300 shadow-sm transition-all select-none hover:border-zinc-500 hover:bg-zinc-800 hover:text-white active:cursor-grabbing"
              onClick={() => onChipClick(suggestion)}
            >
              {suggestion}
            </button>
          ))}
    </div>
  );
}

type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
  error?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
};

function speechRecognition() {
  if (typeof window === "undefined") return null;
  const host = window as Window & {
    SpeechRecognition?: new () => BrowserSpeechRecognition;
    webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
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
