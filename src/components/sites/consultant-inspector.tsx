"use client";

import { useState } from "react";

import { AI_AVATARS, consultantPortrait } from "@/lib/sites/ai-avatars";
import type { ConsultantMode, QuizConsultant, QuizStep, VoiceLocale, VoiceStyle } from "@/lib/sites/quiz-schema";

const field = "h-11 w-full rounded-xl border border-[#e4e4e7] bg-[#fff] px-3 text-sm text-[#09090b] outline-none";

export function ConsultantSettings({
  siteId,
  consultant,
  onChange,
}: {
  siteId: string;
  consultant: QuizConsultant;
  onChange: (consultant: QuizConsultant) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="mt-6 grid gap-3 border-t border-[#e4e4e7] pt-4">
      <p className="text-sm font-semibold"><span>Консультант</span></p>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={consultant.enabled} onChange={(event) => onChange({ ...consultant, enabled: event.target.checked })} />
        <span>Показывать консультанта на шагах</span>
      </label>
      <AvatarGrid consultant={consultant} onPick={(id) => onChange({ ...consultant, aiAvatarId: id, avatarUrl: null })} />
      <div className="flex items-center gap-3">
        <Portrait consultant={consultant} size={36} />
        <label className="cursor-pointer text-xs text-[#cf0234]">
          <span>{busy ? "Загрузка…" : "Загрузить своё фото"}</span>
          <input className="hidden" type="file" accept="image/*" disabled={busy} onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            void uploadAsset(siteId, "consultant_avatar", file, setBusy, setError, (url) => onChange({ ...consultant, avatarUrl: url }));
          }} />
        </label>
        <button type="button" className="text-xs text-[#71717a]" onClick={() => onChange({ ...consultant, avatarUrl: null, aiAvatarId: null })}><span>Сбросить</span></button>
      </div>
      <label className="grid gap-1 text-xs text-[#52525b]"><span>Имя</span><input className={field} value={consultant.name} onChange={(event) => onChange({ ...consultant, name: event.target.value.slice(0, 60) })} /></label>
      <label className="grid gap-1 text-xs text-[#52525b]"><span>Должность</span><input className={field} value={consultant.role} onChange={(event) => onChange({ ...consultant, role: event.target.value.slice(0, 80) })} /></label>
      {error ? <p className="text-xs text-[#cf0234]"><span>{error}</span></p> : null}
    </div>
  );
}

export function HelperInspector({
  siteId,
  title,
  step,
  consultant,
  onChange,
  onConsultant,
}: {
  siteId: string;
  title: string;
  step: QuizStep;
  consultant: QuizConsultant;
  onChange: (step: QuizStep) => void;
  onConsultant: (consultant: QuizConsultant) => void;
}) {
  const helper = step.helper;
  const mode = stepMode(helper.mode);
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState(false);
  const script = helper.aiAvatar.script || helper.text;
  const seconds = Math.max(1, Math.round(script.trim().length / 14));
  function patch(next: QuizStep["helper"]) {
    onChange({ ...step, helper: next, expertTip: next.text.slice(0, 180) });
  }
  function pickPortrait(id: string) {
    onConsultant({ ...consultant, aiAvatarId: id, avatarUrl: null });
    patch({ ...helper, aiAvatar: { ...helper.aiAvatar, avatarId: id } });
    setPicker(false);
  }
  return (
    <div className="grid gap-3 rounded-xl border border-[#e4e4e7] p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold"><span>Подсказка эксперта</span></p>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={helper.enabled} onChange={(event) => patch({ ...helper, enabled: event.target.checked })} />
          <span>На этом шаге</span>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Portrait consultant={consultant} size={36} />
        <p className="min-w-0 flex-1 text-xs">
          <span className="block truncate font-medium">{consultant.name}</span>
          <span className="block truncate text-[#71717a]">{consultant.role}</span>
        </p>
        <button type="button" className="text-xs text-[#cf0234]" onClick={() => setPicker((value) => !value)}><span>Сменить фото/аватар</span></button>
      </div>
      {picker ? (
        <div className="grid gap-2">
          <AvatarGrid consultant={consultant} onPick={pickPortrait} />
          <label className="cursor-pointer text-xs text-[#cf0234]">
            <span>{busy === "photo" ? "Загрузка…" : "Загрузить своё фото"}</span>
            <input className="hidden" type="file" accept="image/*" disabled={busy === "photo"} onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void uploadAsset(siteId, "consultant_avatar", file, (value) => setBusy(value ? "photo" : ""), setError, (url) => {
                onConsultant({ ...consultant, avatarUrl: url });
                setPicker(false);
              });
            }} />
          </label>
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#f4f4f5] p-1 text-[11px]">
        {(["text", "ai_avatar", "custom_video"] as ConsultantMode[]).map((item) => (
          <button key={item} type="button" className={`rounded-lg py-2 ${mode === item ? "bg-[#fff] font-semibold" : "text-[#52525b]"}`} onClick={() => patch({ ...helper, mode: item })}>
            <span>{item === "text" ? "Текст" : item === "ai_avatar" ? "AI-аватар" : "Своё видео"}</span>
          </button>
        ))}
      </div>
      {mode === "text" ? (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[#52525b]"><span>Подсказка</span></span>
            <button type="button" className="rounded-lg border border-[#e4e4e7] px-2.5 py-1.5 text-xs font-medium text-[#09090b]" disabled={busy === "text"} onClick={() => void writeTip()}>
              <span>{busy === "text" ? "Пишем…" : "✨ Сгенерировать с ИИ"}</span>
            </button>
          </div>
          <textarea className={`${field} h-24 py-2`} value={helper.text} maxLength={220} onChange={(event) => patch({ ...helper, text: event.target.value, aiAvatar: { ...helper.aiAvatar, script: helper.aiAvatar.script || event.target.value } })} />
          <span className="text-[11px] text-[#71717a]"><span>{`${helper.text.length}/180 · **цифра** выделяется`}</span></span>
        </div>
      ) : null}
      {mode === "ai_avatar" ? (
        <div className="grid gap-3">
          <AvatarGrid consultant={{ ...consultant, avatarUrl: null, aiAvatarId: helper.aiAvatar.avatarId || consultant.aiAvatarId }} onPick={pickPortrait} />
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-xs text-[#52525b]">
              <span>Язык</span>
              <select className={field} value={consultant.aiVoiceLocale} onChange={(event) => onConsultant({ ...consultant, aiVoiceLocale: event.target.value as VoiceLocale })}>
                <option value="ru">Русский</option>
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="de">Deutsch</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs text-[#52525b]">
              <span>Тон</span>
              <select className={field} value={helper.aiAvatar.voiceStyle} onChange={(event) => patch({ ...helper, aiAvatar: { ...helper.aiAvatar, voiceStyle: event.target.value as VoiceStyle } })}>
                <option value="calm">Спокойный</option>
                <option value="confident">Уверенный</option>
                <option value="friendly">Дружелюбный</option>
              </select>
            </label>
          </div>
          <div className="grid gap-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[#52525b]"><span>Скрипт озвучки</span></span>
              <button type="button" className="rounded-lg border border-[#e4e4e7] px-2.5 py-1.5 text-xs font-medium text-[#09090b]" disabled={busy === "script"} onClick={() => void writeScript()}>
                <span>{busy === "script" ? "Пишем…" : "✨ Написать скрипт ИИ"}</span>
              </button>
            </div>
            <textarea className={`${field} h-24 py-2`} value={script} maxLength={500} onChange={(event) => patch({ ...helper, aiAvatar: { ...helper.aiAvatar, script: event.target.value } })} />
            <span className="text-[11px] text-[#71717a]"><span>{seconds <= 14 ? `~${seconds} сек · идеально для удержания` : `~${seconds} сек · лучше уложить в 12`}</span></span>
          </div>
          <button type="button" className="h-11 rounded-xl bg-[#09090b] text-sm font-semibold text-[#fff]" disabled={busy === "video-job"} onClick={() => void generateVideo()}>
            <span>{busy === "video-job" ? "Отправляем…" : "Сгенерировать видео"}</span>
          </button>
          <p className="text-[11px] text-[#71717a]"><span>{statusLabel(helper.aiAvatar.status, Boolean(helper.aiAvatar.videoUrl))}</span></p>
        </div>
      ) : null}
      {mode === "custom_video" ? (
        <div className="grid gap-2">
          {helper.customVideoUrl ? <video src={helper.customVideoUrl} className="aspect-[4/5] w-full rounded-xl object-cover" muted playsInline /> : null}
          <label className="cursor-pointer text-xs text-[#cf0234]">
            <span>{busy === "video" ? `Загрузка ${progress}%` : helper.customVideoUrl ? "Заменить видео" : "Загрузить mp4, webm или mov"}</span>
            <input className="hidden" type="file" accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov" disabled={busy === "video"} onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void uploadAsset(siteId, "consultant_video", file, (value) => setBusy(value ? "video" : ""), setError, (url) => patch({ ...helper, customVideoUrl: url, enabled: true }), setProgress);
            }} />
          </label>
          {helper.customVideoUrl ? <button type="button" className="text-left text-xs text-[#71717a]" onClick={() => patch({ ...helper, customVideoUrl: null })}><span>Удалить видео</span></button> : null}
          <label className="grid gap-1 text-xs text-[#52525b]">
            <span>Текст для тех, кто без звука</span>
            <textarea className={`${field} h-20 py-2`} value={helper.text} maxLength={220} onChange={(event) => patch({ ...helper, text: event.target.value })} />
          </label>
        </div>
      ) : null}
      {error ? <p className="text-xs text-[#cf0234]"><span>{error}</span></p> : null}
    </div>
  );

  async function writeTip() {
    setBusy("text");
    setError("");
    const response = await fetch("/api/sites/generate-helper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate_step_helper",
        title,
        question: step.title,
        subtitle: step.subtitle,
        options: step.options.map((option) => option.label),
      }),
    });
    const payload = (await response.json()) as { text?: string; error?: string };
    setBusy("");
    if (!response.ok || !payload.text) {
      setError(payload.error || "Не удалось написать подсказку.");
      return;
    }
    patch({ ...helper, enabled: true, mode: "text", text: payload.text, aiAvatar: { ...helper.aiAvatar, script: payload.text } });
  }

  async function writeScript() {
    setBusy("script");
    setError("");
    const response = await fetch("/api/sites/generate-helper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "generate_step_helper",
        title,
        question: step.title,
        subtitle: step.subtitle,
        options: step.options.map((option) => option.label),
      }),
    });
    const payload = (await response.json()) as { text?: string; error?: string };
    setBusy("");
    if (!response.ok || !payload.text) {
      setError(payload.error || "Не удалось написать скрипт.");
      return;
    }
    patch({
      ...helper,
      enabled: true,
      mode: "ai_avatar",
      text: helper.text || payload.text,
      aiAvatar: { ...helper.aiAvatar, script: payload.text },
    });
  }

  async function generateVideo() {
    const avatarId = helper.aiAvatar.avatarId || consultant.aiAvatarId;
    const spoken = (helper.aiAvatar.script || helper.text).trim();
    if (!avatarId || spoken.length < 8) {
      setError("Выберите аватара и напишите скрипт.");
      return;
    }
    setBusy("video-job");
    setError("");
    const response = await fetch("/api/sites/generate-avatar-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, stepId: step.id, avatarId, script: spoken, voiceStyle: helper.aiAvatar.voiceStyle, locale: consultant.aiVoiceLocale }),
    });
    const payload = (await response.json()) as { status?: QuizStep["helper"]["aiAvatar"]["status"]; videoUrl?: string | null; error?: string };
    setBusy("");
    if (!response.ok) {
      setError(payload.error || "Не удалось поставить видео.");
      return;
    }
    const status = payload.status === "ready" || payload.status === "queued" || payload.status === "provider_pending" ? payload.status : "provider_pending";
    patch({
      ...helper,
      enabled: true,
      mode: "ai_avatar",
      aiAvatar: { ...helper.aiAvatar, avatarId, script: spoken, status, videoUrl: payload.videoUrl || helper.aiAvatar.videoUrl },
    });
  }
}

function AvatarGrid({ consultant, onPick }: { consultant: QuizConsultant; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {AI_AVATARS.map((avatar) => {
        const active = !consultant.avatarUrl && consultant.aiAvatarId === avatar.id;
        return (
          <button key={avatar.id} type="button" className={`overflow-hidden rounded-xl border-2 ${active ? "border-[#09090b]" : "border-[#e4e4e7]"}`} onClick={() => onPick(avatar.id)}>
            <img src={avatar.previewImageUrl} alt="" className="aspect-square w-full object-cover" />
            <span className="block truncate px-1 py-1 text-center text-[10px] text-[#52525b]">{avatar.name.split(" ")[0]}</span>
          </button>
        );
      })}
    </div>
  );
}

function Portrait({ consultant, size }: { consultant: QuizConsultant; size: number }) {
  const src = consultantPortrait(consultant);
  if (src) return <img src={src} alt="" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  const letters = consultant.name.split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase() || "A";
  return <span className="grid shrink-0 place-items-center rounded-full bg-[#f4f4f5] text-[11px]" style={{ width: size, height: size }}><span>{letters}</span></span>;
}

function stepMode(mode: QuizStep["helper"]["mode"]): ConsultantMode {
  return mode === "ai_avatar" || mode === "custom_video" ? mode : "text";
}

function statusLabel(status: QuizStep["helper"]["aiAvatar"]["status"], ready: boolean) {
  if (ready || status === "ready") return "Видео готово";
  if (status === "queued") return "Генерируется…";
  if (status === "provider_pending") return "Скрипт готов · на сайте пока показывается портрет и текст до подключения видео-движка";
  return "Скрипт можно озвучить после выбора аватара";
}

function uploadAsset(siteId: string, kind: string, file: File, setBusy: (value: boolean) => void, setError: (value: string) => void, apply: (url: string) => void, onProgress?: (value: number) => void) {
  setBusy(true);
  setError("");
  onProgress?.(0);
  const body = new FormData();
  body.set("file", file);
  body.set("siteId", siteId);
  body.set("kind", kind);
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/sites/upload-asset");
  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
  };
  xhr.onload = () => {
    setBusy(false);
    const payload = JSON.parse(xhr.responseText || "{}") as { url?: string; error?: string };
    if (xhr.status >= 400 || !payload.url) setError(payload.error || "Не удалось загрузить файл.");
    else apply(payload.url);
  };
  xhr.onerror = () => {
    setBusy(false);
    setError("Не удалось загрузить файл.");
  };
  xhr.send(body);
}
