"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowRight, FolderPlus, Loader2, Plus, Trash2, X } from "lucide-react";

import { createProject, deleteProject } from "@/app/actions/smm-projects";
import { toast } from "@/components/ui/toaster";
import { SMM_PROJECT_NAME_MAX, type SmmProject } from "@/lib/smm-project-types";
import { cn } from "@/lib/utils";

const CARD =
  "rounded-3xl border border-gray-200 bg-[#ffffff] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_32px_-12px_rgba(16,24,40,0.08)]";
const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-strike px-6 py-3 text-sm font-semibold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)] transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70";
const BTN_OUTLINE =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-[#ffffff] px-5 py-3 text-sm font-semibold text-[#0b0b0f] transition-colors hover:bg-gray-50 disabled:opacity-50";

export function projectInitial(name: string) {
  return (name.trim().charAt(0) || "P").toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

export function SmmProjectsView({ projects, loadError }: { projects: SmmProject[]; loadError: string | null }) {
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SmmProject | null>(null);

  return (
    <div className="min-h-full bg-[#ffffff]">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Портал · SMM</p>
            <h1 className="mt-3 font-heading text-4xl font-bold tracking-tight text-[#0b0b0f] sm:text-5xl">SMM-проекты</h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-gray-500">
              Каждый проект — отдельный бренд или клиент со своими соцсетями, стратегией, контент-планом и видео.
            </p>
          </div>
          <button type="button" onClick={() => setCreating(true)} className={cn(BTN_PRIMARY, "w-full sm:w-auto")}>
            <Plus className="size-4" strokeWidth={2.5} />
            Создать проект
          </button>
        </header>

        {loadError ? (
          <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">Не удалось загрузить проекты: {loadError}</p>
        ) : null}

        {projects.length === 0 && !loadError ? (
          <div className={cn(CARD, "mt-10 grid place-items-center px-6 py-20 text-center")}>
            <span className="grid size-16 place-items-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-600">
              <FolderPlus className="size-7" strokeWidth={1.75} />
            </span>
            <h2 className="mt-6 font-heading text-2xl font-bold tracking-tight text-[#0b0b0f]">Создайте первый проект</h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-gray-500">Укажите название бренда или клиента — остальное настроите внутри проекта.</p>
            <button type="button" onClick={() => setCreating(true)} className={cn(BTN_PRIMARY, "mt-8")}>
              <Plus className="size-4" strokeWidth={2.5} />
              Создать проект
            </button>
          </div>
        ) : (
          <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {projects.map((project) => (
              <li key={project.id} className={cn(CARD, "group relative transition-all duration-200 hover:-translate-y-0.5 hover:border-rose-200")}>
                <Link href={`/smm/p/${project.id}/settings`} className="flex h-full flex-col p-6 sm:p-7">
                  <span className="grid size-14 place-items-center rounded-2xl bg-strike font-heading text-2xl font-bold text-[#ffffff] shadow-[0_8px_24px_-8px_rgba(207,2,52,0.55)]">
                    {projectInitial(project.name)}
                  </span>
                  <h2 className="mt-6 line-clamp-2 font-heading text-xl font-bold leading-snug tracking-tight text-[#0b0b0f]">{project.name}</h2>
                  <p className="mt-1 text-sm text-gray-500">Создан {formatDate(project.created_at)}</p>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-rose-700">
                    Открыть проект
                    <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
                  </span>
                </Link>
                <button
                  type="button"
                  onClick={() => setDeleting(project)}
                  aria-label={`Удалить проект ${project.name}`}
                  className="absolute right-4 top-4 grid size-9 place-items-center rounded-xl border border-gray-200 bg-[#ffffff] text-gray-400 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                >
                  <Trash2 className="size-4" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating ? <CreateDialog onClose={() => setCreating(false)} /> : null}
      {deleting ? <DeleteDialog project={deleting} onClose={() => setDeleting(null)} /> : null}
    </div>
  );
}

function Modal({ title, text, onClose, busy, children }: { title: string; text: string; onClose: () => void; busy: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[#0b0b0f]/60 p-4" onMouseDown={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-gray-200 bg-[#ffffff] p-6 shadow-2xl sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-heading text-2xl font-bold tracking-tight text-[#0b0b0f]">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-gray-500">{text}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
            className="grid size-9 shrink-0 place-items-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <X className="size-4" strokeWidth={2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await createProject(name);
      if (result.ok) {
        toast.success("Проект создан");
        router.push(`/smm/p/${result.id}/settings`);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Modal title="Новый проект" text="Название бренда или клиента. Его можно будет использовать в отчётах и контент-плане." onClose={onClose} busy={pending}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && !pending) submit();
        }}
      >
        <label htmlFor="project-name" className="mt-6 block text-xs font-semibold uppercase tracking-widest text-gray-500">
          Название
        </label>
        <input
          id="project-name"
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={SMM_PROJECT_NAME_MAX}
          placeholder="Например, Кофейня «Зерно»"
          className="mt-3 w-full rounded-xl border border-gray-200 bg-[#ffffff] px-4 py-3 text-sm text-[#0b0b0f] outline-none transition-colors placeholder:text-gray-400 focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
        />
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className={BTN_OUTLINE}>
            Отмена
          </button>
          <button type="submit" disabled={pending || !name.trim()} className={BTN_PRIMARY}>
            {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} /> : <Plus className="size-4" strokeWidth={2.5} />}
            {pending ? "Создаём…" : "Создать"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteDialog({ project, onClose }: { project: SmmProject; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const result = await deleteProject(project.id);
      if (result.ok) {
        toast.success("Проект удалён");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <Modal title="Удалить проект?" text={`«${project.name}» будет удалён вместе с интеграциями, стратегией и постами. Это действие нельзя отменить.`} onClose={onClose} busy={pending}>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} disabled={pending} className={BTN_OUTLINE}>
          Отмена
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-6 py-3 text-sm font-semibold text-[#ffffff] transition-all hover:bg-rose-700 disabled:opacity-70"
        >
          {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={2} /> : <Trash2 className="size-4" strokeWidth={2} />}
          {pending ? "Удаляем…" : "Удалить"}
        </button>
      </div>
    </Modal>
  );
}
