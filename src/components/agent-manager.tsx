"use client";

import { Play } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { deleteAgent, saveAgent, type SaveState } from "@/app/agents/actions";
import { Button } from "@/components/ui/button";
import { AGENT_MODELS, type AgentRecord } from "@/lib/agent-models";

const fieldClass =
  "w-full rounded-xl border border-transparent bg-zinc-50 px-4 py-3 text-sm text-zinc-900 outline-none transition-all duration-200 placeholder:text-zinc-400 hover:bg-zinc-100/80 focus:border-zinc-300 focus:bg-white";

const initialState: SaveState = { ok: false, error: null, savedId: null };

export function AgentManager({
  agents,
  loadError,
}: {
  agents: AgentRecord[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AgentRecord | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [state, action, pending] = useActionState(saveAgent, initialState);

  useEffect(() => {
    if (!state.savedId) return;
    setEditing(null);
    setDialogOpen(false);
    router.refresh();
  }, [state.savedId, router]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(agent: AgentRecord) {
    setEditing(agent);
    setDialogOpen(true);
  }

  function closeDialog() {
    if (pending) return;
    setDialogOpen(false);
    setEditing(null);
  }

  return (
    <div>
      {loadError ? (
        <p className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Список агентов</h2>
        <Button type="button" onClick={openCreate}>
          + Создать агента
        </Button>
      </div>

      {agents.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-zinc-200/80 bg-white px-6 py-10 text-sm text-zinc-500 shadow-sm">
          Агентов пока нет. Создайте первого, чтобы подключить канал или открыть симулятор.
        </p>
      ) : (
        <ul className="mt-6 grid gap-4">
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm transition-all duration-200 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-heading text-xl font-semibold tracking-tight text-zinc-900">{agent.name}</p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-widest text-zinc-400">{agent.model}</p>
                  <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-500">
                    {agent.system_prompt}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild>
                    <Link href={`/playground?agent=${agent.id}`} aria-label={`Тестировать агента ${agent.name}`}>
                      <Play className="size-4" strokeWidth={2} />
                      Тестировать
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" onClick={() => openEdit(agent)}>
                    Править
                  </Button>
                  <form action={deleteAgent}>
                    <input type="hidden" name="id" value={agent.id} />
                    <Button
                      type="submit"
                      variant="dark"
                      onClick={(event) => {
                        if (!window.confirm(`Удалить агента ${agent.name}?`)) {
                          event.preventDefault();
                        }
                      }}
                    >
                      Удалить
                    </Button>
                  </form>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {dialogOpen ? (
        <AgentDialog
          key={editing?.id ?? "new"}
          editing={editing}
          action={action}
          pending={pending}
          error={state.error}
          onClose={closeDialog}
        />
      ) : null}
    </div>
  );
}

function AgentDialog({
  editing,
  action,
  pending,
  error,
  onClose,
}: {
  editing: AgentRecord | null;
  action: (payload: FormData) => void;
  pending: boolean;
  error: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-zinc-950/40 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-dialog-title"
        className="max-h-[90vh] w-full max-w-xl overflow-x-hidden overflow-y-auto rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.35)]"
      >
        <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Агент</p>
        <h2 id="agent-dialog-title" className="mt-1 text-2xl font-semibold">
          {editing ? "Правка агента" : "Новый агент"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          Имя, модель и системная инструкция задают голос агента.
        </p>

        <form action={action} className="mt-5 grid min-w-0 gap-4">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

          <label className="grid gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Имя</span>
            <input className={fieldClass} name="name" required defaultValue={editing?.name ?? ""} placeholder="Квалификатор" />
          </label>

          <div className="grid min-w-0 gap-4">
            <label className="grid min-w-0 gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">Модель</span>
              <select className={fieldClass} name="model" defaultValue={editing?.model ?? "gpt-4o-mini"}>
                {AGENT_MODELS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <CreativityField defaultValue={editing?.temperature ?? 0.7} />
          </div>

          <label className="grid gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
              Системная инструкция <span className="text-red-600">#ROLE</span>
            </span>
            <textarea
              className={`${fieldClass} min-h-40 resize-y`}
              name="system_prompt"
              required
              defaultValue={editing?.system_prompt ?? ""}
              placeholder={"#ROLE\nТы оператор STRIKE. Отвечай коротко, по делу, без воды."}
            />
          </label>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Сохранение" : "Сохранить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreativityField({ defaultValue }: { defaultValue: number }) {
  const [open, setOpen] = useState(false);

  return (
    <label className="grid min-w-0 gap-2">
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
        Креативность ответов
        <button
          type="button"
          aria-expanded={open}
          aria-label="Что значит креативность ответов"
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-zinc-300 text-[10px] font-semibold normal-case tracking-normal text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-800"
          onClick={(event) => {
            event.preventDefault();
            setOpen((current) => !current);
          }}
        >
          ?
        </button>
      </span>
      {open ? (
        <span
          role="tooltip"
          className="rounded-xl bg-zinc-950 px-3 py-2.5 text-left text-xs leading-5 font-normal normal-case tracking-normal text-white"
        >
          0.0–0.2 — Точные и строгие ответы по инструкциям.
          <br />
          0.7 — Естественный баланс живой речи.
          <br />
          0.8–1.0 — Максимальная свобода и вариативность формулировок.
        </span>
      ) : null}
      <input
        className={fieldClass}
        name="temperature"
        type="number"
        min={0}
        max={2}
        step={0.1}
        defaultValue={defaultValue}
      />
    </label>
  );
}
