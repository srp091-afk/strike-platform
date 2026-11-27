"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";

import { consultantPortrait, findAvatar } from "@/lib/sites/ai-avatars";
import type { ConsultantMode, QuizConsultant, QuizStep, StepHelper } from "@/lib/sites/quiz-schema";
import type { QuizPalette } from "@/lib/sites/theme";

export type ResolvedConsultant = {
  mode: "text" | "video";
  name: string;
  role: string;
  portrait: string | null;
  text: string;
  videoUrl: string;
  poster: string | null;
  placeholder: boolean;
};

export function resolveConsultant(consultant: QuizConsultant, step: QuizStep): ResolvedConsultant | null {
  if (!consultant.enabled || !step.helper.enabled) return null;
  const mode = stepMode(step.helper);
  const portrait = consultantPortrait(consultant) || (mode === "ai_avatar" ? findAvatar(step.helper.aiAvatar.avatarId)?.previewImageUrl ?? null : null);
  const script = step.helper.aiAvatar.script.trim() || step.helper.text.trim();
  const text = (mode === "ai_avatar" ? script : step.helper.text.trim()) || script;
  const generated = step.helper.aiAvatar.videoUrl;
  const own = step.helper.customVideoUrl;
  const playable = mode === "custom_video" ? own : mode === "ai_avatar" ? generated : null;
  if (mode !== "text" && playable) {
    return {
      mode: "video",
      name: consultant.name,
      role: consultant.role,
      portrait,
      text,
      videoUrl: playable,
      poster: step.helper.customVideoPosterUrl,
      placeholder: false,
    };
  }
  if (!text) return null;
  return {
    mode: "text",
    name: consultant.name,
    role: consultant.role,
    portrait,
    text,
    videoUrl: "",
    poster: null,
    placeholder: false,
  };
}

export function useConsultantNarrow(compact: boolean) {
  const [narrow, setNarrow] = useState(compact);
  useEffect(() => {
    if (compact) {
      setNarrow(true);
      return;
    }
    const query = window.matchMedia("(max-width: 1023px)");
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [compact]);
  return narrow;
}

export function ConsultantHost({
  resolved,
  palette,
  compact,
  framed,
  stepId,
  variant,
}: {
  resolved: ResolvedConsultant;
  palette: QuizPalette;
  compact: boolean;
  framed: boolean;
  stepId: string;
  variant: "card" | "bubble";
}) {
  if (variant === "bubble") {
    if (resolved.mode !== "video") return null;
    return <VideoBubble resolved={resolved} palette={palette} framed={framed} stepId={stepId} />;
  }
  if (resolved.mode === "video" && compact) return null;
  return <StepConsultantWidget resolved={resolved} palette={palette} compact={compact} framed={framed} stepId={stepId} />;
}

export function StepConsultantWidget({
  resolved,
  palette,
  compact,
  framed,
  stepId,
}: {
  resolved: ResolvedConsultant;
  palette: QuizPalette;
  compact: boolean;
  framed: boolean;
  stepId: string;
}) {
  if (resolved.mode === "video" && compact) {
    return <VideoBubble resolved={resolved} palette={palette} framed={framed} stepId={stepId} />;
  }
  if (resolved.mode === "video") {
    return (
      <aside className="grid gap-3">
        <PortraitVideo src={resolved.videoUrl} poster={resolved.poster} stepId={stepId} className="aspect-[4/5] w-full" />
        {resolved.text ? <Caption text={resolved.text} palette={palette} /> : null}
      </aside>
    );
  }
  return <TextCard resolved={resolved} palette={palette} compact={compact} />;
}

export function ExpertSign({ consultant, palette }: { consultant: QuizConsultant; palette: QuizPalette }) {
  if (!consultant.enabled || !consultant.showOnLeadScreen || !consultant.name.trim()) return null;
  return (
    <div className="mt-6 flex items-center gap-3">
      <Face name={consultant.name} src={consultantPortrait(consultant)} size={32} palette={palette} />
      <p className="min-w-0 text-[13px] leading-4">
        <span className="block font-medium">{consultant.name}</span>
        <span className="block text-[11px]" style={{ color: palette.muted }}>{consultant.role}</span>
      </p>
    </div>
  );
}

function TextCard({ resolved, palette, compact }: { resolved: ResolvedConsultant; palette: QuizPalette; compact: boolean }) {
  const [open, setOpen] = useState(false);
  const long = resolved.text.length > 90;
  return (
    <aside className={compact ? "rounded-2xl px-3.5 py-3" : "rounded-2xl px-5 py-5"} style={{ border: `1px solid ${palette.line}`, background: palette.card }}>
      <div className="flex items-center gap-3">
        <Face name={resolved.name} src={resolved.portrait} size={compact ? 36 : 48} palette={palette} />
        <p className="min-w-0">
          <span className="block text-[13px] font-medium leading-4 tracking-tight">{resolved.name}</span>
          <span className="mt-1 block text-[11px] leading-4" style={{ color: palette.muted }}>{resolved.role}</span>
        </p>
      </div>
      {resolved.text ? (
        <p className={`text-[14px] leading-6 ${compact ? "mt-3" : "mt-4"} ${compact && long && !open ? "line-clamp-2" : ""}`} style={{ color: palette.fg }}>
          <Rich text={resolved.text} />
        </p>
      ) : null}
      {compact && long ? (
        <button type="button" className="mt-1 text-[11px]" style={{ color: palette.muted }} onClick={() => setOpen((value) => !value)}>
          <span>{open ? "Скрыть" : "Ещё"}</span>
        </button>
      ) : null}
    </aside>
  );
}

function Caption({ text, palette }: { text: string; palette: QuizPalette }) {
  return (
    <p className="text-sm leading-relaxed" style={{ color: palette.muted }}>
      <Rich text={text} />
    </p>
  );
}

function VideoBubble({ resolved, palette, framed, stepId }: { resolved: ResolvedConsultant; palette: QuizPalette; framed: boolean; stepId: string }) {
  const [open, setOpen] = useState(false);
  const preview = useRef<HTMLVideoElement>(null);
  const modal = useRef<HTMLVideoElement>(null);
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    setOpen(false);
    const node = preview.current;
    return () => {
      if (!node) return;
      node.pause();
      node.muted = true;
      node.currentTime = 0;
    };
  }, [stepId]);
  return (
    <>
      <button
        type="button"
        className={`${framed ? "absolute" : "fixed"} bottom-4 right-4 z-20 grid justify-items-end gap-1`}
        onClick={() => setOpen(true)}
      >
        <span className="relative grid h-[60px] w-[60px] place-items-center overflow-hidden rounded-full" style={{ boxShadow: `0 0 0 1px ${palette.accent}` }}>
          <video ref={preview} src={resolved.videoUrl} poster={resolved.poster ?? undefined} muted autoPlay loop playsInline className="h-full w-full object-cover" onLoadedMetadata={(event) => setSeconds(Math.round(event.currentTarget.duration || 0))} />
          <Play className="absolute h-4 w-4" color="#fff" fill="#fff" />
        </span>
        <span className="text-[10px]" style={{ color: palette.muted }}><span>{`Подсказка · ${clock(seconds)}`}</span></span>
      </button>
      {open ? (
        <div className={`${framed ? "absolute" : "fixed"} inset-0 z-30 flex items-end justify-center`} style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="w-full max-w-sm rounded-t-2xl p-4" style={{ background: palette.bg, color: palette.fg }}>
            <div className="mb-3 flex justify-end">
              <button type="button" aria-label="Закрыть" onClick={() => { modal.current?.pause(); setOpen(false); }}>
                <X className="h-4 w-4" color={palette.fg} />
              </button>
            </div>
            <PortraitVideo src={resolved.videoUrl} poster={resolved.poster} stepId={stepId} className="aspect-[4/5] w-full" startWithSound videoRef={modal} />
            {resolved.text ? <div className="mt-3"><Caption text={resolved.text} palette={palette} /></div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function PortraitVideo({
  src,
  poster,
  stepId,
  className,
  startWithSound = false,
  videoRef,
}: {
  src: string;
  poster: string | null;
  stepId: string;
  className: string;
  startWithSound?: boolean;
  videoRef?: RefObject<HTMLVideoElement | null>;
}) {
  const local = useRef<HTMLVideoElement>(null);
  const ref = videoRef ?? local;
  const [sound, setSound] = useState(startWithSound);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.pause();
    node.currentTime = 0;
    node.muted = !startWithSound;
    node.loop = !startWithSound;
    setSound(startWithSound);
    setProgress(0);
    setPaused(false);
    void node.play().catch(() => setPaused(true));
    return () => {
      node.pause();
      node.muted = true;
      node.currentTime = 0;
    };
  }, [stepId, src, startWithSound, ref]);
  function enableSound() {
    const node = ref.current;
    if (!node) return;
    node.currentTime = 0;
    node.muted = false;
    node.loop = false;
    setSound(true);
    setPaused(false);
    void node.play();
  }
  return (
    <div className={`relative overflow-hidden rounded-2xl ${className}`} style={{ background: "#141418" }}>
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        muted={!startWithSound}
        autoPlay
        loop={!startWithSound}
        playsInline
        className="h-full w-full object-cover"
        onTimeUpdate={(event) => {
          const node = event.currentTarget;
          setProgress(node.duration ? node.currentTime / node.duration : 0);
        }}
      />
      <div className="absolute inset-x-0 bottom-0 grid gap-2 p-3" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.55))" }}>
        {sound ? <span className="h-0.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.25)" }}><span className="block h-full" style={{ width: `${progress * 100}%`, background: "#fff" }} /></span> : null}
        <div className="flex items-center gap-2">
          {sound ? (
            <button type="button" className="grid h-8 w-8 place-items-center rounded-full" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => {
              const node = ref.current;
              if (!node) return;
              if (node.paused) void node.play();
              else node.pause();
              setPaused(node.paused);
            }}>
              {paused ? <Play className="h-3.5 w-3.5" color="#fff" fill="#fff" /> : <Pause className="h-3.5 w-3.5" color="#fff" />}
            </button>
          ) : (
            <button type="button" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px]" style={{ background: "rgba(0,0,0,0.45)", color: "#fff" }} onClick={enableSound}>
              <Volume2 className="h-3.5 w-3.5" color="#fff" />
              <span>Включить звук</span>
            </button>
          )}
          {sound ? (
            <button type="button" className="grid h-8 w-8 place-items-center rounded-full" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => {
              const node = ref.current;
              if (!node) return;
              node.muted = !node.muted;
              setSound(!node.muted);
            }}>
              <VolumeX className="h-3.5 w-3.5" color="#fff" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Face({ name, src, size, palette }: { name: string; src: string | null; size: number; palette: QuizPalette }) {
  if (src) return <img src={src} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  const letters = name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "A";
  return (
    <span className="grid shrink-0 place-items-center rounded-full text-[11px] font-medium" style={{ width: size, height: size, background: palette.card, color: palette.fg, border: `1px solid ${palette.line}` }}>
      <span>{letters}</span>
    </span>
  );
}

function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => part.startsWith("**") && part.endsWith("**")
        ? <strong key={index} className="font-semibold"><span>{part.slice(2, -2)}</span></strong>
        : <span key={index}>{part}</span>)}
    </>
  );
}

function stepMode(helper: StepHelper): ConsultantMode {
  return helper.mode === "ai_avatar" || helper.mode === "custom_video" ? helper.mode : "text";
}

function clock(total: number) {
  const seconds = Math.max(0, total);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
