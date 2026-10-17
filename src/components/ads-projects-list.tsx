"use client";

import { Clock, FolderPlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "@/components/ui/toaster";
import { formatRuDate } from "@/lib/ad-project-media";

const visibleCreatives = 6;

export type AdsProjectCard = {
  id: string;
  name: string;
  updatedAt: string | null;
  creativesReplaceAt: string | null;
  previewImages: string[];
};

export function AdsProjectsList({ initialProjects }: { initialProjects: AdsProjectCard[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteProject(id: string) {
    const previous = projects;
    setProjects((current) => current.filter((project) => project.id !== id));
    setDeletingId(id);
    try {
      const response = await fetch(`/api/ads/${id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setProjects(previous);
        toast.error(typeof payload.error === "string" ? payload.error : "Не удалось удалить проект.");
        return;
      }
      toast.success("Проект удалён");
    } catch {
      setProjects(previous);
      toast.error("Не удалось связаться с сервером.");
    } finally {
      setDeletingId(null);
    }
  }

  if (projects.length === 0) {
    return (
      <div className="mt-16 grid place-items-center">
        <div className="grid max-w-md justify-items-center rounded-2xl border border-zinc-800 px-8 py-16 text-center">
          <FolderPlus className="size-8 text-zinc-600" strokeWidth={1.5} />
          <p className="mt-4 text-lg font-medium text-white">У вас пока нет AI-кампаний</p>
          <Button asChild className="mt-6">
            <Link href="/ads/new">Создать первую стратегию</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ul className="mt-10 flex flex-col gap-4">
      {projects.map((project) => (
        <li key={project.id}>
          <ProjectCard
            project={project}
            deleting={deletingId === project.id}
            onDelete={() => void deleteProject(project.id)}
          />
        </li>
      ))}
    </ul>
  );
}

function ProjectCard({
  project,
  deleting,
  onDelete,
}: {
  project: AdsProjectCard;
  deleting: boolean;
  onDelete: () => void;
}) {
  const shown = project.previewImages.slice(0, visibleCreatives);
  const extra = project.previewImages.length - shown.length;

  return (
    <Card className="flex flex-col justify-between gap-6 border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-md sm:p-6 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-medium text-white">{project.name}</h2>
        <p className="mt-1 text-sm text-zinc-400">Генерация лидов на холодную аудиторию</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <p className="text-zinc-500">Обновлено: {formatRuDate(project.updatedAt)}</p>
          <p className="inline-flex items-center gap-1.5 text-zinc-300">
            <Clock className="size-3.5" strokeWidth={2} />
            Рекомендуемая замена креативов: {formatRuDate(project.creativesReplaceAt)}
          </p>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild variant="dark">
            <Link href={`/ads/${project.id}`}>Открыть проект</Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline" disabled={deleting} className="text-rose-300 hover:text-rose-200">
                <Trash2 className="size-4" />
                Удалить
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить проект?</AlertDialogTitle>
                <AlertDialogDescription>
                  Вы уверены, что хотите удалить проект «{project.name}»? Все связанные креативы и тексты будут удалены
                  безвозвратно.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>Удалить</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {shown.length > 0 ? (
        <div className="grid grid-cols-4 gap-2 sm:flex sm:justify-end">
          {shown.map((src, thumbIndex) => {
            const overflow = thumbIndex === shown.length - 1 && extra > 0;
            return (
              <div
                key={`${project.id}-${src}-${thumbIndex}`}
                className="relative aspect-[5/6] overflow-hidden rounded-md border border-zinc-800 sm:aspect-auto sm:h-24 sm:w-24"
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
                {overflow ? (
                  <span className="absolute inset-0 grid place-items-center bg-black/60 text-sm font-medium text-white">
                    +{extra}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}
