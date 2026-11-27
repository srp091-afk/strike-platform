"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

import { quizPalette } from "@/lib/sites/theme";
import type { QuizSchema, QuizStep, ThemeConfig } from "@/lib/sites/quiz-schema";
import { GiftProgress, StartScreen, UnlockedGifts } from "@/components/sites/start-screen";

type Answer = { optionIds: string[]; text: string; value: number };

export function QuizRunner({
  schema,
  theme,
  siteId,
  siteTitle = "",
  live = false,
  screen,
  compact = false,
  embedded = false,
}: {
  schema: QuizSchema;
  theme: ThemeConfig;
  siteId?: string;
  siteTitle?: string;
  live?: boolean;
  screen?: string;
  compact?: boolean;
  embedded?: boolean;
}) {
  const palette = quizPalette(theme);
  const [phase, setPhase] = useState<"start" | "step" | "lead" | "thanks">(schema.startScreen.enabled ? "start" : "step");
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [messenger, setMessenger] = useState(schema.leadScreen.messengers[0] ?? "whatsapp");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const forced = screen === "start" || screen === "lead" || screen === "thanks" ? screen : screen ? "step" : null;
  const shownPhase = forced ?? phase;
  const step = forced && forced === "step" ? schema.steps.find((item) => item.id === screen) ?? schema.steps[index] : schema.steps[index];
  const total = schema.steps.length;
  const progress = shownPhase === "start" ? 0 : shownPhase === "thanks" ? 1 : (Math.min(index, total) + (shownPhase === "lead" ? 1 : 0)) / (total + 1);
  const estimate = useMemo(() => priceOf(schema, answers), [schema, answers]);

  useEffect(() => {
    if (live && siteId) void sendEvent(siteId, "view");
  }, [live, siteId]);

  useEffect(() => {
    if (screen) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (!step || shownPhase !== "step") return;
      if (event.key === "Enter") {
        goNext(answers[step.id]?.optionIds[0]);
        return;
      }
      const digit = Number(event.key);
      const option = step.options[digit - 1];
      if (digit >= 1 && digit <= 9 && option) choose(option.id, step.type !== "multi_choice");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function choose(optionId: string, advance: boolean) {
    if (!step) return;
    setAnswers((current) => {
      const previous = current[step.id] ?? { optionIds: [], text: "", value: step.sliderConfig.defaultValue };
      const optionIds =
        step.type === "multi_choice"
          ? previous.optionIds.includes(optionId)
            ? previous.optionIds.filter((id) => id !== optionId)
            : [...previous.optionIds, optionId]
          : [optionId];
      return { ...current, [step.id]: { ...previous, optionIds } };
    });
    if (advance && !forced) window.setTimeout(() => goNext(optionId), 160);
  }

  function goNext(optionId?: string) {
    if (!step) return;
    const option = step.options.find((item) => item.id === optionId);
    const jump = option?.nextStepId ? schema.steps.findIndex((item) => item.id === option.nextStepId) : -1;
    const next = jump >= 0 ? jump : index + 1;
    if (live && siteId) void sendEvent(siteId, "step_complete", step.id);
    if (next >= schema.steps.length) setPhase("lead");
    else setIndex(next);
  }

  async function submit() {
    if (schema.leadScreen.askPhone && phone.trim().length < 6) {
      setError("Укажите телефон.");
      return;
    }
    if (!live || !siteId) {
      setPhase("thanks");
      return;
    }
    setSending(true);
    setError("");
    const payload = {
      siteId,
      name,
      phone,
      email,
      messenger,
      answers: schema.steps.map((item) => ({
        stepId: item.id,
        question: item.title,
        answer: answerLabel(item, answers[item.id]),
        value: answers[item.id]?.value ?? null,
      })),
      result: schema.calculator.enabled ? { label: schema.calculator.label, amount: estimate, currency: schema.calculator.currency } : null,
      utm: readUtm(),
      referrer: document.referrer,
      device: window.innerWidth < 768 ? "mobile" : "desktop",
      sessionId: sessionId(),
    };
    const response = await fetch("/api/sites/submit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    setSending(false);
    if (!response.ok) {
      setError("Не удалось отправить. Попробуйте ещё раз.");
      return;
    }
    trackLead();
    setPhase("thanks");
  }

  const shellClass = embedded ? "flex h-full min-h-0 flex-col" : "flex min-h-[100dvh] flex-col";
  if (shownPhase === "start") {
    return (
      <div className={shellClass} style={{ background: palette.bg, color: palette.fg, fontFamily: palette.font }}>
        <div className={embedded ? "min-h-0 flex-1" : "min-h-[100dvh]"}>
          <StartScreen schema={schema} theme={theme} siteTitle={siteTitle} compact={compact} onStart={() => { setPhase("step"); if (live && siteId) void sendEvent(siteId, "quiz_start"); }} />
        </div>
      </div>
    );
  }

  const shell = (
    <div className={shellClass} style={{ background: palette.bg, color: palette.fg, fontFamily: palette.font }}>
      <div className="h-1 w-full" style={{ background: palette.line }}>
        <div className="h-full" style={{ width: `${Math.round(progress * 100)}%`, background: palette.accent }} />
      </div>
      <div className={`mx-auto flex w-full max-w-xl flex-1 flex-col px-5 py-8 sm:py-14 ${embedded ? "min-h-0 overflow-y-auto" : ""}`}>
        {theme.logoUrl ? <img src={theme.logoUrl} alt="" className="mb-8 h-8 w-auto object-contain" /> : null}
        {shownPhase === "step" && step ? (
          <Question
            step={step}
            index={schema.steps.findIndex((item) => item.id === step.id)}
            total={total}
            answer={answers[step.id]}
            palette={palette}
            estimate={schema.calculator.enabled ? estimate : null}
            currency={schema.calculator.currency}
            label={schema.calculator.label}
            gift={<GiftProgress schema={schema} remaining={Math.max(1, total - schema.steps.findIndex((item) => item.id === step.id))} palette={palette} />}
            onChoose={choose}
            onText={(value) => setAnswers((current) => ({ ...current, [step.id]: { optionIds: [], text: value, value: 0 } }))}
            onSlide={(value) => setAnswers((current) => ({ ...current, [step.id]: { optionIds: [], text: "", value } }))}
            onBack={() => { if (index === 0 && schema.startScreen.enabled) setPhase("start"); else setIndex(Math.max(0, index - 1)); }}
            onNext={() => goNext(answers[step.id]?.optionIds[0])}
            canBack={!forced && (index > 0 || schema.startScreen.enabled)}
          />
        ) : null}
        {shownPhase === "lead" ? (
          <Lead
            schema={schema}
            palette={palette}
            name={name}
            phone={phone}
            email={email}
            messenger={messenger}
            error={error}
            sending={sending}
            estimate={schema.calculator.enabled ? estimate : null}
            onName={setName}
            onPhone={setPhone}
            onEmail={setEmail}
            onMessenger={setMessenger}
            onBack={() => { setPhase("step"); setIndex(Math.max(0, schema.steps.length - 1)); }}
            onSubmit={() => void submit()}
            gift={<GiftProgress schema={schema} remaining={1} lead palette={palette} />}
          />
        ) : null}
        {shownPhase === "thanks" ? <Thanks schema={schema} palette={palette} estimate={schema.calculator.enabled ? estimate : null} /> : null}
      </div>
      {schema.hideBranding ? null : (
        <p className="pb-6 text-center text-xs" style={{ color: palette.muted }}>
          <a href="https://strikeplatform.io" style={{ color: palette.muted }}>Powered by STRIKE</a>
        </p>
      )}
    </div>
  );
  return shell;
}

function Question(props: {
  step: QuizStep;
  index: number;
  total: number;
  answer?: Answer;
  palette: ReturnType<typeof quizPalette>;
  estimate: number | null;
  currency: string;
  label: string;
  gift?: ReactNode;
  onChoose: (id: string, advance: boolean) => void;
  onText: (value: string) => void;
  onSlide: (value: number) => void;
  onBack: () => void;
  onNext: () => void;
  canBack: boolean;
}) {
  const { step, palette } = props;
  const selected = new Set(props.answer?.optionIds ?? []);
  return (
    <div className="flex flex-1 flex-col">
      <p className="text-xs font-medium" style={{ color: props.palette.muted }}><span>{`Шаг ${props.index + 1} из ${props.total}`}</span></p>
      {props.gift}
      <h2 className="mt-3 text-3xl font-semibold tracking-tight"><span>{step.title}</span></h2>
      {step.subtitle ? <p className="mt-3 leading-6" style={{ color: palette.muted }}><span>{step.subtitle}</span></p> : null}
      <div className="mt-8 grid gap-3">
        {step.type === "text_input" ? (
          <input value={props.answer?.text ?? ""} placeholder={step.placeholder} onChange={(event) => props.onText(event.target.value)} className="h-12 border bg-transparent px-4 outline-none" style={{ borderColor: palette.line, borderRadius: palette.radius, color: palette.fg }} />
        ) : null}
        {step.type === "range_slider" ? (
          <label className="grid gap-3">
            <span className="text-2xl font-semibold">{`${props.answer?.value ?? step.sliderConfig.defaultValue} ${step.sliderConfig.unit}`}</span>
            <input type="range" min={step.sliderConfig.min} max={step.sliderConfig.max} step={step.sliderConfig.step} value={props.answer?.value ?? step.sliderConfig.defaultValue} onChange={(event) => props.onSlide(Number(event.target.value))} />
          </label>
        ) : null}
        {step.type !== "text_input" && step.type !== "range_slider"
          ? step.options.map((option, optionIndex) => {
              const active = selected.has(option.id);
              return (
                <button key={option.id} type="button" onClick={() => props.onChoose(option.id, step.type !== "multi_choice")} className="flex items-start gap-3 border px-4 py-4 text-left" style={{ borderColor: active ? palette.accent : palette.line, background: active ? palette.card : "transparent", borderRadius: palette.radius }}>
                  <span className="text-xs font-semibold" style={{ color: palette.muted }}>{optionIndex + 1}</span>
                  <span>
                    <span className="block text-base font-medium">{option.label}</span>
                    {option.description ? <span className="mt-1 block text-sm" style={{ color: palette.muted }}>{option.description}</span> : null}
                  </span>
                </button>
              );
            })
          : null}
      </div>
      {step.expertTip ? <p className="mt-6 text-sm" style={{ color: palette.muted }}><span>{step.expertTip}</span></p> : null}
      {props.estimate != null ? <p className="mt-6 text-sm" style={{ color: palette.muted }}><span>{`${props.label}: ${props.estimate.toLocaleString("ru-RU")} ${props.currency}`}</span></p> : null}
      <div className="sticky bottom-0 mt-auto flex gap-3 pt-8">
        {props.canBack ? <button type="button" className="h-12 flex-1 border text-sm" style={{ borderColor: palette.line, borderRadius: palette.radius }} onClick={props.onBack}><span>Назад</span></button> : null}
        {step.type === "multi_choice" || step.type === "text_input" || step.type === "range_slider" ? (
          <button type="button" className="h-12 flex-1 text-sm font-semibold text-[#fff]" style={{ background: palette.accent, borderRadius: palette.radius }} onClick={props.onNext}><span>Далее</span></button>
        ) : null}
      </div>
    </div>
  );
}

function Lead(props: {
  schema: QuizSchema;
  palette: ReturnType<typeof quizPalette>;
  name: string;
  phone: string;
  email: string;
  messenger: string;
  error: string;
  sending: boolean;
  estimate: number | null;
  onName: (value: string) => void;
  onPhone: (value: string) => void;
  onEmail: (value: string) => void;
  onMessenger: (value: "whatsapp" | "telegram" | "phone") => void;
  onBack: () => void;
  onSubmit: () => void;
  gift?: ReactNode;
}) {
  const lead = props.schema.leadScreen;
  const field = { height: 48, border: `1px solid ${props.palette.line}`, borderRadius: props.palette.radius, background: "transparent", color: props.palette.fg, padding: "0 16px", width: "100%" };
  return (
    <form className="flex flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
      <h2 className="text-3xl font-semibold tracking-tight"><span>{lead.headline}</span></h2>
      {props.gift}
      <p className="mt-3 leading-6" style={{ color: props.palette.muted }}><span>{lead.subheadline}</span></p>
      {props.estimate != null ? <p className="mt-4 text-sm"><span>{`${props.schema.calculator.label}: ${props.estimate.toLocaleString("ru-RU")} ${props.schema.calculator.currency}`}</span></p> : null}
      <div className="mt-8 grid gap-3">
        {lead.askName ? <input style={field} placeholder="Имя" value={props.name} onChange={(event) => props.onName(event.target.value)} /> : null}
        {lead.askPhone ? <input style={field} placeholder="Телефон" value={props.phone} onChange={(event) => props.onPhone(event.target.value)} /> : null}
        {lead.askEmail ? <input style={field} placeholder="Email" value={props.email} onChange={(event) => props.onEmail(event.target.value)} /> : null}
        {lead.askMessenger ? (
          <div className="flex gap-2">
            {lead.messengers.map((item) => (
              <button key={item} type="button" className="h-10 flex-1 border text-sm" style={{ borderColor: props.messenger === item ? props.palette.accent : props.palette.line, borderRadius: props.palette.radius }} onClick={() => props.onMessenger(item)}>
                <span>{item === "whatsapp" ? "WhatsApp" : item === "telegram" ? "Telegram" : "Звонок"}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {props.error ? <p className="mt-3 text-sm" style={{ color: props.palette.accent }}><span>{props.error}</span></p> : null}
      <div className="mt-auto flex gap-3 pt-8">
        <button type="button" className="h-12 flex-1 border text-sm" style={{ borderColor: props.palette.line, borderRadius: props.palette.radius }} onClick={props.onBack}><span>Назад</span></button>
        <button type="submit" disabled={props.sending} className="h-12 flex-1 text-sm font-semibold text-[#fff]" style={{ background: props.palette.accent, borderRadius: props.palette.radius }}>
          <span>{props.sending ? "Отправка" : lead.ctaText}</span>
        </button>
      </div>
      <p className="mt-3 text-xs" style={{ color: props.palette.muted }}><span>{lead.privacyText}</span></p>
    </form>
  );
}

function Thanks({ schema, palette, estimate }: { schema: QuizSchema; palette: ReturnType<typeof quizPalette>; estimate: number | null }) {
  const action = schema.thankYouScreen.primaryAction;
  return (
    <div className="flex flex-1 flex-col justify-center">
      <h2 className="text-4xl font-semibold tracking-tight"><span>{schema.thankYouScreen.headline}</span></h2>
      <p className="mt-4 text-lg leading-7" style={{ color: palette.muted }}><span>{schema.thankYouScreen.subheadline}</span></p>
      {schema.thankYouScreen.showSummary && estimate != null ? <p className="mt-6 text-sm"><span>{`${schema.calculator.label}: ${estimate.toLocaleString("ru-RU")} ${schema.calculator.currency}`}</span></p> : null}
      <UnlockedGifts schema={schema} palette={palette} />
      {action.type !== "none" && action.url ? (
        <a href={action.url} className="mt-8 inline-flex h-12 items-center justify-center px-6 text-sm font-semibold text-[#fff]" style={{ background: palette.accent, borderRadius: palette.radius }}>
          <span>{action.label || "Открыть"}</span>
        </a>
      ) : null}
    </div>
  );
}

function priceOf(schema: QuizSchema, answers: Record<string, Answer>) {
  const impact = schema.steps.reduce((sum, step) => {
    const picked = answers[step.id]?.optionIds ?? [];
    return sum + step.options.filter((option) => picked.includes(option.id)).reduce((inner, option) => inner + option.priceImpact, 0);
  }, 0);
  return Math.max(0, schema.calculator.basePrice + impact);
}

function answerLabel(step: QuizStep, answer?: Answer) {
  if (!answer) return "";
  if (step.type === "text_input") return answer.text;
  if (step.type === "range_slider") return `${answer.value || step.sliderConfig.defaultValue} ${step.sliderConfig.unit}`;
  return step.options.filter((option) => answer.optionIds.includes(option.id)).map((option) => option.label).join(", ");
}

function readUtm() {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get("utm_source") ?? "",
    utm_medium: params.get("utm_medium") ?? "",
    utm_campaign: params.get("utm_campaign") ?? "",
    utm_content: params.get("utm_content") ?? "",
    utm_term: params.get("utm_term") ?? "",
  };
}

function sessionId() {
  const key = "strike-quiz-session";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = Math.random().toString(36).slice(2);
  window.sessionStorage.setItem(key, next);
  return next;
}

function sendEvent(siteId: string, eventType: string, stepId?: string) {
  return fetch("/api/sites/event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ siteId, eventType, stepId, sessionId: sessionId() }),
  }).catch(() => null);
}

function trackLead() {
  const win = window as Window & { fbq?: (...args: unknown[]) => void; gtag?: (...args: unknown[]) => void; ym?: (...args: unknown[]) => void };
  win.fbq?.("track", "Lead");
  win.gtag?.("event", "generate_lead");
  const metrika = document.querySelector("script[data-metrika]")?.getAttribute("data-metrika");
  if (metrika) win.ym?.(Number(metrika), "reachGoal", "quiz_lead");
}
