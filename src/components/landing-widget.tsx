"use client";

import { useState } from "react";

import type { LandingRecord } from "@/lib/landing-types";

const quizSteps = ["Как к вам обращаться?", "Какая задача сейчас важнее всего?", "Куда отправить следующий шаг?"];

export function LandingWidget({ landing }: { landing: LandingRecord }) {
  return (
    <div id="landing-chat" className="sticky bottom-4 z-20 mx-auto w-[min(100%-2rem,28rem)]">
      <div className="rounded-[28px] border border-black/5 bg-white p-4 text-zinc-900 shadow-[0_24px_60px_-28px_rgba(0,0,0,0.45)]">
        <p className="px-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
          {landing.agentName ?? "ИИ-консультант"}
        </p>
        {landing.captureMode === "quiz" ? <Quiz landing={landing} /> : <Chat landing={landing} />}
      </div>
    </div>
  );
}

function Chat({ landing }: { landing: LandingRecord }) {
  const [messages, setMessages] = useState<{ role: "assistant" | "user"; content: string }[]>([
    { role: "assistant", content: landing.welcomeMessage || "Расскажите, что хотите запустить." },
  ]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);

  async function send() {
    const text = draft.trim();
    if (!text || pending) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setDraft("");
    setPending(true);
    try {
      const response = await fetch("/api/landing-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ landingId: landing.id, messages: next.filter((item) => item.role === "user" || item.role === "assistant") }),
      });
      const payload = (await response.json()) as { reply?: string; error?: string };
      setMessages((current) => [
        ...current,
        { role: "assistant", content: payload.reply || payload.error || "Не удалось ответить." },
      ]);
    } catch {
      setMessages((current) => [...current, { role: "assistant", content: "Не удалось ответить." }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mt-3 grid max-h-56 gap-2 overflow-y-auto px-1">
        {messages.map((message, index) => (
          <p
            key={`${message.role}-${index}`}
            className={
              message.role === "user"
                ? "justify-self-end rounded-2xl bg-zinc-950 px-3 py-2 text-sm text-white"
                : "justify-self-start rounded-2xl bg-zinc-100 px-3 py-2 text-sm text-zinc-800"
            }
          >
            {message.content}
          </p>
        ))}
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <input
          value={draft}
          placeholder="Напишите сообщение"
          className="min-w-0 flex-1 rounded-full bg-zinc-100 px-4 py-2.5 text-sm outline-none"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={pending || !draft.trim()} className="rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
          {pending ? "..." : "Отправить"}
        </button>
      </form>
    </div>
  );
}

function Quiz({ landing }: { landing: LandingRecord }) {
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return <p className="mt-3 px-2 text-sm leading-6 text-zinc-700">{landing.successMessage || "Спасибо. Мы уже на связи."}</p>;
  }

  return (
    <form
      className="mt-3 grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!answer.trim()) return;
        if (step >= quizSteps.length - 1) {
          setDone(true);
          return;
        }
        setStep((current) => current + 1);
        setAnswer("");
      }}
    >
      <p className="px-2 text-sm font-medium text-zinc-800">{quizSteps[step]}</p>
      <input
        value={answer}
        className="rounded-full bg-zinc-100 px-4 py-2.5 text-sm outline-none"
        onChange={(event) => setAnswer(event.target.value)}
      />
      <button type="submit" className="justify-self-start rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">
        Дальше
      </button>
    </form>
  );
}
