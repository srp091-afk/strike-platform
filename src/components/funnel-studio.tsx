"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { saveLandingDraft } from "@/app/funnels/actions";
import { LandingView } from "@/components/landing-view";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LandingRecord } from "@/lib/landing-types";

type AgentOption = { id: string; name: string };
type ChatLine = { role: "user" | "assistant"; content: string };

const fieldClass =
  "w-full rounded-xl border border-zinc-800 bg-black px-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-zinc-600 focus:border-white";

export function FunnelStudio({
  agents,
  initialLanding,
  initialPrompt,
}: {
  agents: AgentOption[];
  initialLanding: LandingRecord | null;
  initialPrompt: string;
}) {
  const [landing, setLanding] = useState<LandingRecord | null>(initialLanding);
  const [lines, setLines] = useState<ChatLine[]>(() =>
    initialLanding
      ? [{ role: "assistant", content: "Лендинг открыт. Напишите, что изменить, или поправьте поля во вкладке настроек." }]
      : [],
  );
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!initialPrompt || initialLanding || started.current) return;
    started.current = true;
    void generate(initialPrompt);
  }, [initialPrompt, initialLanding]);

  async function generate(prompt: string) {
    const text = prompt.trim();
    if (!text || pending) return;
    setLines((current) => [...current, { role: "user", content: text }]);
    setDraft("");
    setPending(true);
    setNotice(null);
    try {
      const response = await fetch("/api/generate-landing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: text,
          landingId: landing?.id,
          agentId: landing?.agentId ?? null,
        }),
      });
      const payload = (await response.json()) as { landing?: LandingRecord; error?: string };
      if (!response.ok || !payload.landing) {
        setLines((current) => [...current, { role: "assistant", content: payload.error || "Не удалось собрать лендинг." }]);
        return;
      }
      setLanding(payload.landing);
      setLines((current) => [
        ...current,
        { role: "assistant", content: "Готово. Справа живой лендинг. Можно уточнить тон, блоки или оффер." },
      ]);
      window.history.replaceState(null, "", `/funnels/builder?id=${payload.landing.id}`);
    } catch {
      setLines((current) => [...current, { role: "assistant", content: "Не удалось собрать лендинг." }]);
    } finally {
      setPending(false);
    }
  }

  async function persist(next: LandingRecord, published?: boolean) {
    setNotice(null);
    const document = {
      ...next.document,
      status: published ? ("published" as const) : next.document.status,
    };
    const result = await saveLandingDraft({
      id: next.id,
      title: next.title,
      subtitle: next.subtitle,
      agentId: next.agentId,
      captureMode: next.captureMode,
      welcomeMessage: next.welcomeMessage,
      successMessage: next.successMessage,
      document,
    });
    if (!result.ok || !result.landing) {
      setNotice(result.error);
      return;
    }
    setLanding(result.landing);
    setNotice(published || result.landing.document.status === "published" ? "Опубликовано" : "Сохранено");
  }

  return (
    <div className="grid h-[calc(100dvh-4rem)] lg:grid-cols-[24rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b border-zinc-800 bg-black lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Конструктор</p>
            <h1 className="text-lg font-semibold">{landing?.title ?? "Новый лендинг"}</h1>
          </div>
          <Link href="/funnels" className="text-sm text-zinc-400 hover:text-white">
            К списку
          </Link>
        </div>
        <Tabs defaultValue="chat" className="min-h-0 flex-1 px-4 py-4">
          <TabsList>
            <TabsTrigger value="chat">Чат</TabsTrigger>
            <TabsTrigger value="settings">Ручные настройки</TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex min-h-0 flex-1 flex-col">
            <div className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {lines.length === 0 ? (
                <p className="text-sm leading-6 text-zinc-400">Опишите нишу, и я соберу лендинг справа.</p>
              ) : null}
              {lines.map((line, index) => (
                <p
                  key={`${line.role}-${index}`}
                  className={
                    line.role === "user"
                      ? "ml-8 rounded-2xl bg-white px-3 py-2 text-sm leading-6 text-black"
                      : "mr-6 rounded-2xl bg-zinc-800 px-3 py-2 text-sm leading-6 text-zinc-100"
                  }
                >
                  {line.content}
                </p>
              ))}
              {pending ? <p className="text-sm text-zinc-400">Собираю структуру и тексты...</p> : null}
            </div>
            <form
              className="mt-3 grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void generate(draft);
              }}
            >
              <textarea
                value={draft}
                rows={3}
                placeholder="Например: сделай тон жёстче и добавь блок отзывов"
                className={fieldClass}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void generate(draft);
                  }
                }}
              />
              <Button type="submit" disabled={pending || draft.trim().length < 8}>
                {pending ? "Генерация" : "Отправить"}
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="settings" className="min-h-0 flex-1 overflow-y-auto">
            {landing ? (
              <SettingsForm
                landing={landing}
                agents={agents}
                notice={notice}
                onChange={setLanding}
                onSave={() => void persist(landing)}
                onPublish={() => void persist(landing, true)}
              />
            ) : (
              <p className="text-sm text-zinc-400">Настройки появятся после первой генерации.</p>
            )}
          </TabsContent>
        </Tabs>
      </aside>

      <section className="min-h-0 bg-black p-4 sm:p-6">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] border border-zinc-800 bg-zinc-950">
          <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-3">
            <span className="size-2.5 rounded-full bg-zinc-700" />
            <span className="size-2.5 rounded-full bg-zinc-700" />
            <span className="size-2.5 rounded-full bg-zinc-700" />
            <p className="ml-3 truncate text-xs text-zinc-400">{landing ? `/l/${landing.slug}` : "Предпросмотр"}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {landing && landing.document.sections.length > 0 ? (
              <LandingView landing={landing} />
            ) : (
              <div className="grid h-full place-items-center px-8 text-center text-sm text-zinc-400">
                Здесь появится лендинг, как только модель вернёт секции.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function SettingsForm({
  landing,
  agents,
  notice,
  onChange,
  onSave,
  onPublish,
}: {
  landing: LandingRecord;
  agents: AgentOption[];
  notice: string | null;
  onChange: (landing: LandingRecord) => void;
  onSave: () => void;
  onPublish: () => void;
}) {
  function patch(partial: Partial<LandingRecord>) {
    onChange({ ...landing, ...partial });
  }

  return (
    <div className="grid gap-4 pb-6">
      <label className="grid gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Название</span>
        <input className={fieldClass} value={landing.title} onChange={(event) => patch({ title: event.target.value })} />
      </label>
      <label className="grid gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Подзаголовок</span>
        <textarea className={fieldClass} rows={3} value={landing.subtitle} onChange={(event) => patch({ subtitle: event.target.value })} />
      </label>
      <label className="grid gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Агент</span>
        <SelectField
          value={landing.agentId ?? ""}
          options={[{ value: "", label: "Не выбран" }, ...agents.map((agent) => ({ value: agent.id, label: agent.name }))]}
          onChange={(next) => patch({ agentId: next || null, agentName: agents.find((agent) => agent.id === next)?.name ?? null })}
        />
      </label>
      <label className="grid gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Режим захвата</span>
        <SelectField
          value={landing.captureMode}
          options={[
            { value: "chat", label: "Чат" },
            { value: "quiz", label: "Квиз" },
          ]}
          onChange={(next) => patch({ captureMode: next === "quiz" ? "quiz" : "chat" })}
        />
      </label>
      <label className="grid gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Приветствие чата</span>
        <textarea
          className={fieldClass}
          rows={3}
          value={landing.welcomeMessage}
          onChange={(event) => patch({ welcomeMessage: event.target.value })}
        />
      </label>
      <label className="grid gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Сообщение после квиза</span>
        <textarea
          className={fieldClass}
          rows={2}
          value={landing.successMessage}
          onChange={(event) => patch({ successMessage: event.target.value })}
        />
      </label>
      {notice ? <p className="text-sm text-zinc-300">{notice}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={onSave}>
          Сохранить
        </Button>
        <Button type="button" onClick={onPublish}>
          Опубликовать
        </Button>
        <a href={`/l/${landing.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-semibold text-zinc-300 hover:text-white">
          Открыть
        </a>
      </div>
    </div>
  );
}
