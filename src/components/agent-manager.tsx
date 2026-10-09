"use client";

import { Play } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { deleteAgent, saveAgent, type SaveState } from "@/app/agents/actions";
import { IndexMark } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { AGENT_MODELS, type AgentRecord } from "@/lib/agent-models";

const fieldClass =
  "w-full border border-black bg-white px-3 py-3 text-sm text-black outline-none focus:outline-2 focus:outline-offset-[-2px] focus:outline-strike";

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
  const [state, action, pending] = useActionState(saveAgent, initialState);

  useEffect(() => {
    if (!state.savedId) return;
    setEditing(null);
    router.refresh();
  }, [state.savedId, router]);

  return (
    <div className="grid gap-8">
      {loadError ? (
        <p className="border border-strike bg-white px-4 py-3 text-sm">{loadError}</p>
      ) : null}

      <form
        key={editing?.id ?? state.savedId ?? "new"}
        action={action}
        className="grid gap-8 border border-black p-6 lg:grid-cols-[280px_1fr]"
      >
        <div className="border-b border-black pb-6 lg:border-b-0 lg:border-r lg:pr-6 lg:pb-0">
          <p className="font-display text-xs font-bold uppercase tracking-[0.22em] text-strike">
            {editing ? "Правка" : "01"}
          </p>
          <h2 className="mt-3 text-3xl">{editing ? "Правка агента" : "Новый агент"}</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-700">
            Имя, модель и системная инструкция #ROLE задают голос агента.
          </p>
        </div>

        <div className="grid gap-5">
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

          <label className="grid gap-2">
            <span className="font-display text-xs font-bold uppercase tracking-[0.2em]">Имя</span>
            <input
              className={fieldClass}
              name="name"
              required
              defaultValue={editing?.name ?? ""}
              placeholder="РИНГСАЙД"
            />
          </label>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="font-display text-xs font-bold uppercase tracking-[0.2em]">
                Модель
              </span>
              <select
                className={fieldClass}
                name="model"
                defaultValue={editing?.model ?? "gpt-4o-mini"}
              >
                {AGENT_MODELS.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2">
              <span className="font-display text-xs font-bold uppercase tracking-[0.2em]">
                Температура
              </span>
              <input
                className={fieldClass}
                name="temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                defaultValue={editing?.temperature ?? 0.7}
              />
            </label>
          </div>

          <label className="grid gap-2">
            <span className="font-display text-xs font-bold uppercase tracking-[0.2em]">
              Системная инструкция
              <span className="ml-2 text-strike">#ROLE</span>
            </span>
            <textarea
              className={`${fieldClass} min-h-48 resize-y`}
              name="system_prompt"
              required
              defaultValue={editing?.system_prompt ?? ""}
              placeholder={"#ROLE\nТы оператор STRIKE. Отвечай коротко, по делу, без воды."}
            />
          </label>

          {state.error ? (
            <p className="border border-strike px-3 py-2 text-sm">{state.error}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Сохранение" : "Сохранить"}
            </Button>
            {editing ? (
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Отмена
              </Button>
            ) : null}
          </div>
        </div>
      </form>

      <section>
        <h2 className="text-3xl">Состав</h2>
        {agents.length === 0 ? (
          <p className="mt-4 border border-black px-4 py-6 text-sm uppercase tracking-[0.16em] text-zinc-600">
            Агентов пока нет
          </p>
        ) : (
          <ul className="mt-4 border-t border-black">
            {agents.map((agent, index) => (
              <li key={agent.id} className="border-b border-black">
                <div className="flex flex-col gap-4 px-1 py-5 sm:flex-row sm:items-start">
                  <IndexMark value={String(index + 1).padStart(2, "0")} />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-2xl font-bold uppercase tracking-wide">
                      {agent.name}
                    </p>
                    <p className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">
                      {agent.model}
                    </p>
                    <p className="mt-3 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                      {agent.system_prompt}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild variant="default">
                      <Link href={`/playground?agent=${agent.id}`} aria-label={`Тестировать агента ${agent.name}`}>
                        <Play className="size-4" strokeWidth={2.25} />
                        Тестировать
                      </Link>
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditing(agent)}>
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
      </section>
    </div>
  );
}
