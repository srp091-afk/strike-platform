"use client";

import { Clock, FolderPlus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { CreativeRender } from "@/components/creatives/CreativeRender";
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
import type { AdsPreviewCreative, AdsProjectCard } from "@/lib/ad-project-types";

export type { AdsProjectCard };

/** Max thumbnails per project card; the 4th carries the "+N" overflow badge. */
const maxThumbnails = 4;

export function AdsProjectsList({
  initialProjects,
  onMutate,
}: {
  initialProjects: AdsProjectCard[];
  onMutate?: () => void;
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setProjects(initialProjects);
  }, [initialProjects]);

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
      onMutate?.();
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
  const previewCreatives = project.previewCreatives ?? [];
  const previewImages = project.previewImages ?? [];
  const total = previewCreatives.length > 0 ? previewCreatives.length : previewImages.length;
  // Up to 4 thumbnails. If there are more, the 4th becomes a counter tile:
  // it shows "+{total - 3}" (itself + everything after it stays hidden).
  const shown = (
    previewCreatives.length > 0 ? previewCreatives : previewImages.map((src) => fallbackPreview(src))
  ).slice(0, maxThumbnails);
  const extra = total > maxThumbnails ? total - 3 : 0;

  return (
    <Card className="flex flex-col justify-between gap-6 border-zinc-800 bg-zinc-900/40 p-5 backdrop-blur-md sm:p-6 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-medium text-white">{project.name}</h2>
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
          {shown.map((creative, thumbIndex) => {
            const overflow = thumbIndex === shown.length - 1 && extra > 0;
            return (
              <div
                key={`${project.id}-${creative.images[0] ?? thumbIndex}-${thumbIndex}`}
                // Each thumbnail renders in ITS OWN format proportion
                // (fixed height, width from aspect — mixed packs stay tidy).
                className={`relative h-20 shrink-0 overflow-hidden rounded-md border border-zinc-800 sm:h-24 ${
                  creative.format === "9:16" ? "aspect-[9/16]" : "aspect-[4/5]"
                }`}
              >
                <div className="pointer-events-none absolute inset-0 origin-top-left scale-[1] [&>*]:!rounded-none">
                  <CreativeRender
                    styleId={creative.styleKey}
                    headline={creative.headline}
                    subheadline={creative.subheadline}
                    bullets={creative.bullets}
                    antiBullets={creative.antiBullets}
                    badge={creative.badge}
                    buttonText={creative.buttonText}
                    images={creative.images}
                    accentColor={creative.accentColor}
                    format={creative.format ?? "4:5"}
                  />
                </div>
                {overflow ? (
                  <span className="absolute inset-0 z-10 grid place-items-center bg-black/60 text-base font-semibold tracking-tight text-white backdrop-blur-[1px]">
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

function fallbackPreview(src: string): AdsPreviewCreative {
  return {
    images: [src, src],
    headline: "Оффер",
    bullets: ["Результат"],
    buttonText: "CTA",
    styleKey: "before-after-vs",
    accentColor: "#E11D48",
  };
}
