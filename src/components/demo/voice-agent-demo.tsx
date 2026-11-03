"use client";

import { ArrowUp, Globe, Mic, MicOff } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import type { PlasmaState } from "@/components/demo/plasma-sphere";
import { cn } from "@/lib/utils";

// three.js тяжёлый и нужен только в браузере — грузим отдельным чанком, без SSR.
const PlasmaSphere = dynamic(() => import("@/components/demo/plasma-sphere").then((module) => module.PlasmaSphere), {
  ssr: false,
});

type ChatMessage = { role: "user" | "assistant"; content: string };

const CHIPS = [
  "Чем вы можете помочь моему бизнесу?",
  "Сколько это стоит?",
  "Как быстро можно запустить?",
  "Покажи пример диалога с клиентом",
] as const;

const MIC_DENIED = "Доступ к микрофону запрещён. Разрешите его в настройках браузера и попробуйте снова.";

/** Пустой WAV: «прогрев» Audio в обработчике клика, иначе Safari/iOS потом блокирует автозапуск озвучки. */
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

/** Скрытый стартовый триггер: на экране и в истории не показывается, бэкенд отвечает приветствием. */
const START_TRIGGER = "START_CONVERSATION";

/** Тишина, после которой запись реплики закрывается и уходит на распознавание (Whisper). */
const SILENCE_COMMIT_MS = 1300;
/** Сколько суммарно должно звучать «голоса», чтобы запись считалась речью, а не щелчком или шумом. */
const MIN_VOICE_MS = 250;
const VAD_TICK_MS = 80;
/** Если никто не заговорил, запись перезапускается — не копим длинную тишину (Whisper на ней фантазирует). */
const IDLE_RESTART_MS = 6000;

/** Границы озвучки: законченное предложение и мягкая пауза (запятая и т.п.) — только если кусок уже достаточно длинный. */
const MIN_SENTENCE_CHARS = 12;
const MIN_CLAUSE_CHARS = 45;

const URL_PATTERN =
  /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|ru|net|org|ai|co|app|dev|pro|biz|info|me|by|ua|kz|su|eu|ge|tr|de|uk|us|xyz|online|site|shop|store|agency)\b(?:\/\S*)?/i;

/** Ищет ссылку на сайт в реплике (набранной или надиктованной). */
function extractUrl(text: string): { url: string; onlyUrl: boolean } | null {
  const match = text.match(URL_PATTERN);
  if (!match) return null;
  const raw = match[0].replace(/[.,!?)»”"']+$/, "");
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return { url, onlyUrl: text.replace(match[0], "").replace(/[\s.,!?]/g, "") === "" };
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Отрезает от накопленного текста стрима готовые к озвучке куски: законченные предложения (. ! ? …)
 * и, чтобы голос стартовал быстрее, длинные фразы по запятой/точке с запятой/двоеточию.
 * Знак без пробела после него («3.5», «e.g.» на границе чанков) границей не считается.
 */
function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let start = 0;
  let pending = "";
  for (const match of buffer.matchAll(/([.!?…]+["»”')]*|[,;:])\s/g)) {
    const end = match.index + match[0].length;
    pending += buffer.slice(start, end);
    start = end;
    const soft = /^[,;:]$/.test(match[1]!);
    if (pending.trim().length >= (soft ? MIN_CLAUSE_CHARS : MIN_SENTENCE_CHARS)) {
      sentences.push(pending.trim());
      pending = "";
    }
  }
  return { sentences, rest: pending + buffer.slice(start) };
}

/** Запрашивает озвучку куска. Возвращает blob-URL mp3 или null при ошибке (кусок пропускаем). */
async function fetchSpeech(sentence: string, signal: AbortSignal): Promise<string | null> {
  try {
    const response = await fetch("/api/demo/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sentence }),
      signal,
    });
    if (!response.ok) return null;
    return URL.createObjectURL(await response.blob());
  } catch {
    return null;
  }
}

export function VoiceAgentDemo() {
  const [isRecording, setIsRecording] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [interim, setInterim] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const [debug, setDebug] = useState(false);
  const [siteHost, setSiteHost] = useState<string | null>(null);

  // История нужна только как контекст для LLM — на экране ответы агента не показываем, их можно лишь услышать.
  const historyRef = useRef<ChatMessage[]>([]);
  const siteUrlRef = useRef("");
  const chatAbortRef = useRef<AbortController | null>(null);

  const micOnRef = useRef(false);
  const busyRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const sessionRef = useRef<{ stop: (send: boolean) => void } | null>(null);
  const debugStopRef = useRef<(() => void) | null>(null);
  const startListeningRef = useRef<() => void>(() => undefined);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const queueRef = useRef<Promise<string | null>[]>([]);
  const playingRef = useRef(false);
  const epochRef = useRef(0);
  const ttsAbortRef = useRef<AbortController | null>(null);
  const finishPlayRef = useRef<(() => void) | null>(null);

  // Поддержку API знает только браузер — проверяем после монтирования, чтобы не ломать гидратацию.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia));
    setDebug(new URLSearchParams(window.location.search).get("debug") === "true");
    return () => {
      micOnRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      sessionRef.current?.stop(false);
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      void micCtxRef.current?.close().catch(() => undefined);
      chatAbortRef.current?.abort();
    };
  }, []);

  // Демо занимает весь экран под шапкой: страница не скроллится.
  useEffect(() => {
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, []);

  // Строгая очередность: пока агент думает или говорит, микрофон глух; договорил — слушаем снова.
  useEffect(() => {
    const busy = isSpeaking || isReplying;
    busyRef.current = busy;
    if (!isRecording) return;

    if (busy) {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      sessionRef.current?.stop(false); // недослушанную запись выбрасываем
      return;
    }
    // Короткая пауза, чтобы хвост озвучки не попал в микрофон.
    restartTimerRef.current = setTimeout(() => startListeningRef.current(), 400);
    return () => {
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    };
  }, [isSpeaking, isReplying, isRecording]);
  /** Один Audio на всё демо: разблокированный жестом элемент переиспользуется для каждого куска очереди. */
  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = SILENT_WAV;
      void audio.play().catch(() => undefined);
      audioRef.current = audio;

      // Анализатор амплитуды нужен, чтобы сфера пульсировала в такт речи. Без него сфера просто анимируется CSS-ом.
      try {
        const Ctx =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const context = new Ctx();
          const analyser = context.createAnalyser();
          analyser.fftSize = 256;
          context.createMediaElementSource(audio).connect(analyser);
          analyser.connect(context.destination);
          audioCtxRef.current = context;
          analyserRef.current = analyser;
        }
      } catch {
        analyserRef.current = null;
      }
    }
    void audioCtxRef.current?.resume();
    return audioRef.current;
  }, []);

  /** Ручное прерывание, часть 1: очищает очередь, отменяет запросы озвучки и мгновенно останавливает текущий звук. */
  const stopSpeaking = useCallback(() => {
    epochRef.current += 1;
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;

    const pending = queueRef.current;
    queueRef.current = [];
    for (const item of pending) void item.then((url) => (url ? URL.revokeObjectURL(url) : undefined));

    const audio = audioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
    }
    finishPlayRef.current?.();
    finishPlayRef.current = null;
    debugStopRef.current?.();
    debugStopRef.current = null;
    playingRef.current = false;
    setIsSpeaking(false);
  }, []);

  /** Строго последовательное проигрывание: следующий кусок стартует по `onended` предыдущего. */
  const playQueue = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    const epoch = epochRef.current;
    const audio = ensureAudio();

    while (queueRef.current.length > 0) {
      const url = await queueRef.current.shift()!;
      if (epoch !== epochRef.current) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (!url) continue;

      await new Promise<void>((resolve) => {
        finishPlayRef.current = resolve;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.src = url;
        audio.play().catch(() => resolve());
      });
      finishPlayRef.current = null;
      URL.revokeObjectURL(url);
      if (epoch !== epochRef.current) return;
    }

    playingRef.current = false;
    setIsSpeaking(false);
  }, [ensureAudio]);

  /** Кусок сразу уходит на озвучку (параллельно с остальными), а в очередь встаёт в порядке следования. */
  const enqueueSpeech = useCallback(
    (sentence: string) => {
      const controller = (ttsAbortRef.current ??= new AbortController());
      queueRef.current.push(fetchSpeech(sentence, controller.signal));
      setIsSpeaking(true);
      void playQueue();
    },
    [playQueue],
  );

  useEffect(() => () => stopSpeaking(), [stopSpeaking]);

  /**
   * Отправляет историю на /api/demo/chat. Текст агента на экран не выводится: по мере прихода его нарезают
   * на куски и отправляют в очередь озвучки.
   */
  const handleSendMessage = useCallback(
    async (text: string, websiteUrl: string, greeting = false): Promise<void> => {
      void text; // реплика пользователя уже в historyRef — API получает всю историю целиком
      const controller = new AbortController();
      chatAbortRef.current = controller;
      const reply: ChatMessage = { role: "assistant", content: "" };
      let sentenceBuffer = "";
      stopSpeaking(); // новый ответ не должен накладываться на хвост предыдущего
      setIsReplying(true);
      setError(null);

      try {
        const response = await fetch("/api/demo/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: greeting ? [{ role: "user", content: START_TRIGGER }] : historyRef.current,
            websiteUrl: websiteUrl || undefined,
            lang: navigator.language,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Не удалось получить ответ агента.");
        }

        if (response.headers.get("x-site-status") === "failed") {
          siteUrlRef.current = "";
          setSiteHost(null);
        }

        historyRef.current = [...historyRef.current, reply];

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          reply.content += chunk;

          const taken = takeSentences(sentenceBuffer + chunk);
          sentenceBuffer = taken.rest;
          for (const sentence of taken.sentences) enqueueSpeech(sentence);
        }
        const tail = sentenceBuffer.trim();
        if (tail && !controller.signal.aborted) enqueueSpeech(tail);
      } catch (failure) {
        if (controller.signal.aborted) return;
        setError(failure instanceof Error ? failure.message : "Не удалось получить ответ агента.");
      } finally {
        if (!reply.content) historyRef.current = historyRef.current.filter((message) => message !== reply);
        if (chatAbortRef.current === controller) chatAbortRef.current = null;
        setIsReplying(false);
      }
    },
    [enqueueSpeech, stopSpeaking],
  );

  /** Ручное прерывание, часть 2: обрывает стрим LLM и всю озвучку. */
  const interruptAgent = useCallback(() => {
    chatAbortRef.current?.abort();
    stopSpeaking();
  }, [stopSpeaking]);

  /** Единая точка входа для любого запроса пользователя (голос, чипс, текст): сначала перебиваем бота, потом спрашиваем заново. */
  const submitText = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      // Микрофон не трогаем — он остаётся включённым, перебиваем только агента.
      interruptAgent();

      let text = trimmed;
      const found = extractUrl(trimmed);
      if (found) {
        siteUrlRef.current = found.url;
        setSiteHost(hostOf(found.url));
        if (found.onlyUrl) text = "Вот мой сайт. Изучи его и представься менеджером этой компании.";
      }

      setInterim("");
      historyRef.current = [...historyRef.current, { role: "user", content: text }];
      void handleSendMessage(text, siteUrlRef.current);
    },
    [handleSendMessage, interruptAgent],
  );

  /** Отправляет запись реплики в Whisper и передаёт распознанный текст агенту. Язык определяется автоматически. */
  const transcribe = useCallback(
    async (blob: Blob) => {
      setIsReplying(true); // «Думаю…» и глухой микрофон на время распознавания
      let text = "";
      try {
        const form = new FormData();
        form.append("audio", blob, "speech");
        const response = await fetch("/api/demo/stt", { method: "POST", body: form });
        const payload = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error ?? "Не удалось распознать речь.");
        text = payload?.text?.trim() ?? "";
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Не удалось распознать речь.");
      }
      if (text && micOnRef.current) {
        submitText(text); // дальше isReplying ведёт handleSendMessage
      } else {
        setIsReplying(false); // тишина или ошибка: освобождаем очередь, микрофон слушает снова
      }
    },
    [submitText],
  );

  /**
   * Одна реплика клиента: MediaRecorder пишет микрофон, простой VAD по громкости ждёт речь и 1,3 с тишины,
   * после чего запись уходит в Whisper. Пока агент занят, сессия не работает.
   */
  const startListening = useCallback(() => {
    const stream = micStreamRef.current;
    const analyser = micAnalyserRef.current;
    if (!micOnRef.current || busyRef.current || sessionRef.current || !stream || !analyser) return;

    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((type) =>
      MediaRecorder.isTypeSupported(type),
    );
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      setSupported(false);
      return;
    }

    const chunks: Blob[] = [];
    const samples = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    let noise = 0.01;
    let voiced = 0;
    let lastVoice = 0;
    let speaking = false;
    let send = false;
    let finished = false;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      sessionRef.current = null;
      setInterim("");
      if (send && chunks.length > 0) {
        void transcribe(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
      } else if (micOnRef.current && !busyRef.current) {
        restartTimerRef.current = setTimeout(() => startListeningRef.current(), 150);
      }
    };

    const finish = (sendIt: boolean) => {
      if (finished) return;
      finished = true;
      send = sendIt;
      window.clearInterval(timer);
      if (recorder.state !== "inactive") recorder.stop();
      else recorder.onstop?.(new Event("stop"));
    };

    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += sample * sample;
      const rms = Math.sqrt(sum / samples.length);
      const now = performance.now();

      if (rms > Math.max(0.02, noise * 2.5)) {
        voiced += VAD_TICK_MS;
        lastVoice = now;
        if (!speaking && voiced >= MIN_VOICE_MS) {
          speaking = true;
          setInterim("Слушаю…");
        }
      } else {
        noise += (rms - noise) * 0.05; // подстраиваемся под фоновый шум комнаты
        if (!speaking && now - lastVoice > 600) voiced = 0; // отдельные щелчки в сумму не копим
      }

      if (speaking && now - lastVoice > SILENCE_COMMIT_MS) finish(true);
      else if (!speaking && now - startedAt > IDLE_RESTART_MS) finish(false);
    }, VAD_TICK_MS);

    sessionRef.current = { stop: finish };
    try {
      recorder.start();
    } catch {
      finish(false);
    }
  }, [transcribe]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  function releaseMic() {
    micOnRef.current = false;
    if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
    sessionRef.current?.stop(false);
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    void micCtxRef.current?.close().catch(() => undefined);
    micCtxRef.current = null;
  }

  function toggleMic() {
    ensureAudio(); // клик — момент, когда браузер разрешает «разбудить» звук и запросить микрофон
    // Ручное действие: если бот говорит или думает, он замолкает, а микрофон остаётся включённым.
    if (isRecording && (isSpeaking || isReplying)) {
      interruptAgent();
      return;
    }
    if (isRecording) {
      releaseMic();
      setIsRecording(false);
      setInterim("");
      return;
    }
    setError(null);
    micOnRef.current = true;
    setIsRecording(true);
    // Первый запуск микрофона: агент сам начинает разговор скрытым триггером.
    if (historyRef.current.length === 0) void handleSendMessage("", siteUrlRef.current, true);

    // Микрофон с жёстким эхо- и шумоподавлением: поток держим, пока слушаем.
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (!micOnRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const Ctx =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        const context = new Ctx();
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser); // к динамикам не подключаем — иначе эхо
        void context.resume();
        micStreamRef.current = stream;
        micCtxRef.current = context;
        micAnalyserRef.current = analyser;
        startListening();
      } catch {
        releaseMic();
        setIsRecording(false);
        setError(MIC_DENIED);
      }
    })();
  }
  function handleChip(question: string) {
    ensureAudio();
    submitText(question);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    ensureAudio();
    submitText(draft);
    setDraft("");
  }

  /**
   * ?debug=true: локальный тест без API. Играет /demo/debug.mp3 (если файл лежит в public/demo), иначе
   * синтезирует речеподобный сигнал. Звук идёт через тот же AnalyserNode, что и голос ElevenLabs.
   */
  async function toggleDebugAudio() {
    if (isSpeaking) {
      stopSpeaking();
      return;
    }
    const audio = ensureAudio();
    stopSpeaking();
    setIsSpeaking(true);

    const hasFile = await fetch("/demo/debug.mp3", { method: "HEAD" })
      .then((response) => response.ok)
      .catch(() => false);

    if (hasFile) {
      const finish = () => {
        audio.onended = null;
        audio.onerror = null;
        setIsSpeaking(false);
      };
      audio.onended = finish;
      audio.onerror = finish;
      audio.src = "/demo/debug.mp3";
      audio.play().catch(finish);
      return;
    }

    const context = audioCtxRef.current;
    const analyser = analyserRef.current;
    if (!context || !analyser) {
      setIsSpeaking(false);
      return;
    }
    await context.resume();
    const out = context.createGain();
    out.gain.value = 0;
    out.connect(analyser);

    const oscillator = context.createOscillator();
    oscillator.type = "sawtooth";
    const formants = [700, 1200, 2600].map((frequency) => {
      const filter = context.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = frequency;
      filter.Q.value = 4;
      oscillator.connect(filter);
      filter.connect(out);
      return filter;
    });

    // Слоги: случайная громкость, высота тона и форманты, между фразами — паузы.
    const duration = 10;
    let at = context.currentTime + 0.1;
    const end = at + duration;
    while (at < end) {
      const level = 0.25 + Math.random() * 0.75;
      const length = 0.1 + Math.random() * 0.14;
      oscillator.frequency.setValueAtTime(95 + Math.random() * 90, at);
      formants[0]!.frequency.setValueAtTime(400 + Math.random() * 500, at);
      formants[1]!.frequency.setValueAtTime(900 + Math.random() * 900, at);
      out.gain.setTargetAtTime(level, at, 0.025);
      out.gain.setTargetAtTime(0.03, at + length, 0.03);
      at += length + 0.04 + (Math.random() < 0.12 ? 0.5 : 0.02);
    }
    oscillator.start();
    oscillator.stop(end);

    const stop = () => {
      try {
        oscillator.stop();
      } catch {
        /* уже остановлен */
      }
      oscillator.disconnect();
      out.disconnect();
    };
    debugStopRef.current = stop;
    oscillator.onended = () => {
      if (debugStopRef.current === stop) {
        debugStopRef.current = null;
        setIsSpeaking(false);
      }
    };
  }
  const userSpeaking = isRecording && interim !== "";
  const sphereState: PlasmaState = isSpeaking ? "speaking" : isReplying ? "thinking" : userSpeaking ? "listening" : "idle";
  const caption = error
    ? null
    : userSpeaking
      ? interim
      : isReplying && !isSpeaking
        ? "Думаю…"
        : isRecording && !isSpeaking
          ? "Слушаю…"
          : siteHost
            ? `Сайт: ${siteHost}`
            : "";

  return (
    <div className="fixed inset-x-0 top-16 bottom-0 z-30 flex flex-col items-center overflow-hidden bg-black px-4 pt-2 pb-10 text-white">
      {debug ? (
        <button
          type="button"
          onClick={toggleDebugAudio}
          className="absolute top-4 right-4 z-10 rounded-full border border-white/15 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:border-white/30 hover:text-white"
        >
          {isSpeaking ? "■ Стоп" : "▶ Тест звука"}
        </button>
      ) : null}

      <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-2">
        <PlasmaSphere state={sphereState} analyserRef={analyserRef} />

        <div className="flex min-h-8 max-w-xl shrink-0 flex-col items-center gap-1 text-center">
          {error ? (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          ) : null}
          {!supported ? (
            <p role="alert" className="text-sm text-amber-400">
              Голосовой ввод недоступен в этом браузере — используйте Chrome, Edge или Safari, либо пишите текстом.
            </p>
          ) : null}
          {caption ? <p className="text-sm text-zinc-400 transition-opacity">{caption}</p> : null}
        </div>
      </div>

      <div className="flex w-full max-w-3xl shrink-0 flex-col items-center gap-4">
        <p className="flex items-center gap-1.5 text-xs tracking-wide text-zinc-500">
          <Globe className="size-3.5" strokeWidth={1.5} />
          Говорю на любом языке
        </p>

        <div className="flex w-full flex-nowrap gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => handleChip(chip)}
              className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition-all duration-200 first:ml-auto last:mr-auto hover:border-white/30 hover:bg-white/5 hover:text-white active:scale-95"
            >
              {chip}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex w-full max-w-xl items-center gap-2">
          <input
            type="text"
            autoComplete="off"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Спросите о чем угодно или вставьте ссылку..."
            aria-label="Сообщение агенту"
            className="min-w-0 flex-1 border-b border-white/10 bg-transparent px-1 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-zinc-500 focus:border-white/40"
          />

          <button
            type="submit"
            disabled={!draft.trim()}
            aria-label="Отправить"
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full transition-all",
              draft.trim()
                ? "bg-white/15 text-white hover:bg-white/25 active:scale-95"
                : "cursor-default bg-transparent text-zinc-600",
            )}
          >
            <ArrowUp className="size-4" strokeWidth={2} />
          </button>
          <div className="relative shrink-0">
            {!isRecording && supported ? (
              <span
                role="tooltip"
                className="pointer-events-none absolute right-0 bottom-full mb-3 animate-bounce whitespace-nowrap rounded-full bg-strike px-3 py-1.5 text-xs font-medium text-white shadow-[0_0_24px_-6px_rgba(207,2,52,0.9)]"
              >
                Нажмите, чтобы начать диалог
                <span aria-hidden className="absolute -bottom-1 right-4 size-2 rotate-45 bg-strike" />
              </span>
            ) : null}
            <button
              type="button"
              onClick={toggleMic}
              disabled={!supported}
              aria-pressed={isRecording}
              aria-label={isRecording ? "Выключить микрофон" : "Включить микрофон"}
              className={cn(
                "relative grid size-12 place-items-center rounded-full text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
                isRecording
                  ? "bg-strike shadow-[0_0_24px_-6px_rgba(207,2,52,0.8)] hover:brightness-110"
                  : "bg-strike/90 shadow-[0_0_30px_-4px_rgba(207,2,52,0.9)] hover:brightness-110",
              )}
            >
              {!isRecording || userSpeaking ? (
                <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-strike/50" />
              ) : null}
              {isRecording ? (
                <Mic className="relative size-5" strokeWidth={1.75} />
              ) : (
                <MicOff className="relative size-5" strokeWidth={1.75} />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}