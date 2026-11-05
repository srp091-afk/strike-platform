"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, ImageIcon, Loader2, Sparkles, Trash2, Upload } from "lucide-react";

import { deleteAsset } from "@/app/actions/smm-assets";
import { CARD, INK, SectionTitle } from "@/components/smm/smm-view";
import { toast } from "@/components/ui/toaster";
import type { SmmAssetItem } from "@/lib/smm-asset-types";
import { cn } from "@/lib/utils";

type Filter = "all" | "ai_generated" | "user_upload";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "ai_generated", label: "Сгенерированные AI" },
  { id: "user_upload", label: "Мои загрузки" },
];

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function AssetsGallery({ initialAssets }: { initialAssets: SmmAssetItem[] }) {
  const [assets, setAssets] = useState(initialAssets);
  const [filter, setFilter] = useState<Filter>("all");
  const visible = useMemo(() => (filter === "all" ? assets : assets.filter((a) => a.assetType === filter)), [assets, filter]);

  return (
    <div className="space-y-6">
      <SectionTitle title="Медиатека" text="Все видео и изображения проекта: сгенерированные AI-студией и загруженные вручную." />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const count = f.id === "all" ? assets.length : assets.filter((a) => a.assetType === f.id).length;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                filter === f.id
                  ? "border-strike bg-strike text-[#ffffff]"
                  : "border-gray-200 bg-[#ffffff] text-[#0b0b0f] hover:border-rose-300 hover:bg-rose-50/50",
              )}
            >
              {f.label} <span className="opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className={cn(CARD, "flex flex-col items-center px-6 py-16 text-center")}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-strike">
            <ImageIcon className="h-6 w-6" />
          </span>
          <p className={cn("mt-4 font-heading text-lg font-bold", INK)}>{assets.length === 0 ? "Медиатека пуста" : "В этой категории пока ничего нет"}</p>
          <p className="mt-1 max-w-md text-sm text-gray-500">Файлы появятся здесь после генерации видео или загрузки материалов в AI-Видеостудии.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onDeleted={(id) => setAssets((prev) => prev.filter((a) => a.id !== id))} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssetCard({ asset, onDeleted }: { asset: SmmAssetItem; onDeleted: (id: string) => void }) {
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState(false);
  const ai = asset.assetType === "ai_generated";

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch(asset.fileUrl);
      if (!res.ok) throw new Error("bad response");
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const ext = asset.fileUrl.split("?")[0].split(".").pop() || (asset.isVideo ? "mp4" : "png");
      a.href = href;
      a.download = `strike-${asset.id.slice(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(href);
    } catch {
      window.open(asset.fileUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  function remove() {
    if (!window.confirm("Удалить файл навсегда? Его нельзя будет восстановить.")) return;
    startTransition(async () => {
      const result = await deleteAsset(asset.id, asset.fileUrl);
      if (result.ok) {
        toast.success("Файл удалён");
        onDeleted(asset.id);
      } else {
        toast.error(result.error);
      }
    });
  }

  return (
    <div className={cn(CARD, "flex flex-col overflow-hidden", pending && "opacity-60")}>
      <div className="relative h-56 w-full bg-gray-100">
        {asset.isVideo ? (
          <video src={asset.fileUrl} preload="metadata" controls playsInline className="h-full w-full bg-[#0b0b0f] object-contain" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.fileUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        )}
        <span
          className={cn(
            "pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm",
            ai ? "bg-violet-600 text-[#ffffff]" : "bg-gray-200 text-[#374151]",
          )}
        >
          {ai ? <Sparkles className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
          {ai ? "AI" : "Загрузка"}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-xs text-gray-500">{formatDate(asset.createdAt)}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={download}
            disabled={downloading}
            aria-label="Скачать"
            title="Скачать"
            className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#0b0b0f] disabled:opacity-50"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            aria-label="Удалить"
            title="Удалить"
            className="rounded-lg p-2 text-rose-500 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}