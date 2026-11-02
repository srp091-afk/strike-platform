"use client";

import { Globe, Mic, Square } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import type {
  SpeechRecognitionConstructor,
  SpeechRecognitionErrorEventLike,
  SpeechRecognitionEventLike,
  SpeechRecognitionLike,
} from "@/components/demo/speech-recognition";
import { cn } from "@/lib/utils";

type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

type SpeechLang = "ru-RU" | "en-US";

const LANG_OPTIONS: { value: SpeechLang; label: string }[] = [
  { value: "ru-RU", label: "RU" },
  { value: "en-US", label: "EN" },
];

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Доступ к микрофону запрещён. Разрешите его в настройках браузера и попробуйте снова.",
  "service-not-allowed": "Доступ к микрофону запрещён. Разрешите его в настройках браузера и попробуйте снова.",
  "audio-capture": "Микрофон не найден. Подключите устройство записи.",
  network: "Не удалось связаться с сервисом распознавания речи. Проверьте интернет.",
};

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const speech = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return speech.SpeechRecognition ?? speech.webkitSpeechRecognition ?? null;
}

export function VoiceAgentDemo() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isReplying, setIsReplying] = useState(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [lang, setLang] = useState<SpeechLang>("ru-RU");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef("");
  const urlRef = useRef(websiteUrl);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    urlRef.current = websiteUrl;
  }, [websiteUrl]);

  // Поддержку API знает только браузер — проверяем после монтирования, чтобы не ломать гидратацию.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getRecognitionConstructor() !== null);
    return () => {
      recognitionRef.current?.abort();
      abortRef.current?.abort();
    };
  }, []);

  /** Единая точка записи в историю: ref нужен, чтобы запрос к API видел актуальный список без ожидания рендера. */
  const updateMessages = useCallback((update: (current: ChatMessage[]) => ChatMessage[]) => {
    messagesRef.current = update(messagesRef.current);
    setMessages(messagesRef.current);
  }, []);

  /** Отправляет историю на /api/demo/chat и по мере прихода кусков дописывает их в сообщение ассистента. */
  const handleSendMessage = useCallback(
    async (text: string, websiteUrl: string): Promise<void> => {
      void text; // реплика пользователя уже в messagesRef — API получает всю историю целиком
      const controller = new AbortController();
      abortRef.current = controller;
      const assistantId = crypto.randomUUID();
      setIsReplying(true);
      setError(null);

      try {
        const response = await fetch("/api/demo/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: messagesRef.current.map(({ role, content }) => ({ role, content })),
            websiteUrl: websiteUrl || undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Не удалось получить ответ агента.");
        }

        updateMessages((current) => [...current, { id: assistantId, role: "assistant", content: "" }]);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          updateMessages((current) =>
            current.map((message) => (message.id === assistantId ? { ...message, content: message.content + chunk } : message)),
          );
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : "Не удалось получить ответ агента.");
      } finally {
        // Пустой пузырь (ошибка до первого куска) убираем.
        updateMessages((current) => current.filter((message) => message.id !== assistantId || message.content !== ""));
        if (abortRef.current === controller) abortRef.current = null;
        setIsReplying(false);
      }
    },
    [updateMessages],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, interim]);

  const commitTranscript = useCallback(() => {
    const text = finalRef.current.trim();
    finalRef.current = "";
    setInterim("");
    if (!text) return;
    updateMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: text }]);
    void handleSendMessage(text, urlRef.current.trim());
  }, [handleSendMessage, updateMessages]);

  const startRecording = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setSupported(false);
      return;
    }

    setError(null);
    finalRef.current = "";
    setInterim("");

    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]!;
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (finalText) finalRef.current = `${finalRef.current} ${finalText}`.trim();
      setInterim(interimText || finalRef.current);
    };
    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      // «no-speech» и «aborted» — штатные ситуации, пользователю об ошибке говорить не нужно.
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(ERROR_TEXT[event.error] ?? "Не удалось распознать речь. Попробуйте ещё раз.");
    };
    // Речь закончилась (пауза или повторный клик) — фиксируем распознанный текст как сообщение пользователя.
    recognition.onend = () => {
      setIsRecording(false);
      recognitionRef.current = null;
      commitTranscript();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setError("Не удалось запустить запись. Попробуйте ещё раз.");
      recognitionRef.current = null;
    }
  }, [commitTranscript, lang]);

  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      return;
    }
    startRecording();
  }

  return (
    <div className="relative isolate flex min-h-screen flex-col items-center overflow-hidden bg-black px-4 py-8 text-white sm:py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[620px] bg-[radial-gradient(60%_50%_at_50%_0%,rgba(207,2,52,0.18),transparent_70%)]"
      />

      <header className="mb-6 flex w-full max-w-2xl items-center justify-between">
        <BrandLogo />
        <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium tracking-wide text-zinc-300">
          Voice Agent · Demo
        </span>
      </header>

      <main className="flex w-full max-w-2xl flex-1 flex-col gap-4">
        <div className="relative">
          <Globe className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-zinc-500" strokeWidth={1.75} />
          <input
            type="url"
            inputMode="url"
            autoComplete="off"
            value={websiteUrl}
            onChange={(event) => setWebsiteUrl(event.target.value)}
            placeholder="Вставьте ссылку на ваш сайт..."
            aria-label="Ссылка на сайт"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 pr-4 pl-11 text-sm text-white outline-none transition-colors duration-200 placeholder:text-zinc-600 hover:border-zinc-700 focus:border-white"
          />
        </div>

        <section
          aria-label="История диалога"
          className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/50 backdrop-blur-md"
        >
          <div ref={scrollRef} className="flex max-h-[52vh] flex-1 flex-col gap-3 overflow-y-auto p-4 sm:p-5">
            {messages.length === 0 && !interim ? (
              <p className="m-auto max-w-xs text-center text-sm leading-6 text-zinc-500">
                Нажмите на микрофон и задайте вопрос голосом. Ваша речь появится здесь.
              </p>
            ) : null}

            {messages.map((message) => (
              <Bubble key={message.id} role={message.role}>
                {message.content}
              </Bubble>
            ))}

            {interim ? (
              <Bubble role="user" draft>
                {interim}
              </Bubble>
            ) : null}
          </div>
        </section>

        {error ? (
          <p role="alert" className="text-center text-sm text-red-400">
            {error}
          </p>
        ) : null}
        {!supported ? (
          <p role="alert" className="text-center text-sm text-amber-400">
            Ваш браузер не поддерживает распознавание речи. Откройте демо в Chrome, Edge или Safari.
          </p>
        ) : null}

        <div className="flex flex-col items-center gap-4 pt-2 pb-2">
          <button
            type="button"
            onClick={toggleRecording}
            disabled={!supported || isReplying}
            aria-pressed={isRecording}
            aria-label={isRecording ? "Остановить запись" : "Начать запись"}
            className="group relative grid size-20 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isRecording ? (
              <>
                <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-strike/40" />
                <span
                  aria-hidden
                  className="absolute -inset-3 animate-pulse rounded-full bg-strike/25 blur-xl motion-reduce:animate-none"
                />
              </>
            ) : null}
            <span
              className={cn(
                "relative grid size-20 place-items-center rounded-full text-white transition-all duration-300 group-active:scale-95",
                isRecording
                  ? "bg-strike shadow-[0_0_50px_-4px_rgba(207,2,52,0.9)]"
                  : "bg-strike shadow-[0_0_30px_-6px_rgba(207,2,52,0.6)] group-hover:brightness-110 group-hover:shadow-[0_0_40px_-4px_rgba(207,2,52,0.8)]",
              )}
            >
              {isRecording ? <Square className="size-7 fill-current" strokeWidth={2} /> : <Mic className="size-8" strokeWidth={1.75} />}
            </span>
          </button>

          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>
              {isRecording ? "Слушаю… нажмите, чтобы закончить" : isReplying ? "Агент отвечает…" : "Нажмите, чтобы говорить"}
            </span>
            <span aria-hidden className="text-zinc-700">
              |
            </span>
            <div role="radiogroup" aria-label="Язык речи" className="flex items-center gap-1">
              {LANG_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={lang === option.value}
                  disabled={isRecording}
                  onClick={() => setLang(option.value)}
                  className={cn(
                    "rounded px-1.5 py-0.5 font-medium transition-colors disabled:cursor-not-allowed",
                    lang === option.value ? "text-white" : "text-zinc-500 hover:text-zinc-300",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Bubble({
  role,
  draft = false,
  children,
}: {
  role: "user" | "assistant";
  draft?: boolean;
  children: React.ReactNode;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex animate-in", isUser ? "justify-end" : "justify-start")}>
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 break-words whitespace-pre-wrap",
          isUser ? "rounded-br-md bg-strike/90 text-white" : "rounded-bl-md border border-white/10 bg-white/5 text-zinc-200",
          draft && "opacity-60",
        )}
      >
        {children}
      </p>
    </div>
  );
}
