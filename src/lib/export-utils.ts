/*
 * ВАЖНО: Для корректной работы html-to-image необходимо настроить CORS
 * в Supabase Storage бакете 'creatives', разрешив метод GET и заголовки
 * от домена приложения.
 */

import { saveAs } from "file-saver";
import { toPng } from "html-to-image";
import JSZip from "jszip";

/**
 * html-to-image@1.11 has no literal `useCORS` option; CORS is enabled by
 * requesting images with `mode: "cors"` (the library also loads <img> with
 * crossOrigin="anonymous").
 */
const PNG_OPTIONS = {
  fetchRequestInit: {
    mode: "cors" as RequestMode,
    credentials: "omit" as RequestCredentials,
  },
  // Belt-and-braces: system UI (hover overlays with Увеличить/Скачать/…)
  // is marked data-export-ignore and never lands in the exported PNG,
  // even if an export node ever wraps it again.
  filter: (node: HTMLElement) =>
    !(node instanceof HTMLElement && node.hasAttribute("data-export-ignore")),
};

/** Exact export resolutions per format. */
const EXPORT_TARGETS = {
  "4:5": { width: 1856, height: 2304 },
  "9:16": { width: 1080, height: 1920 },
} as const;

function targetForNode(node: HTMLElement): { width: number; height: number } {
  const declared = node.dataset.format;
  if (declared === "9:16" || declared === "4:5") return EXPORT_TARGETS[declared];
  // Fallback: infer from the live aspect (tall nodes are stories).
  const width = node.clientWidth || 1;
  const height = node.clientHeight || 1;
  return EXPORT_TARGETS[height / width > 1.5 ? "9:16" : "4:5"];
}

function sanitizeFileName(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "creative";
}

function withPngExtension(fileName: string): string {
  const safe = sanitizeFileName(fileName);
  return /\.png$/i.test(safe) ? safe : `${safe}.png`;
}

async function nodeToPngDataUrl(node: HTMLElement): Promise<string> {
  // Capture STRICTLY at the format's target resolution: scale the live
  // node by (target / liveWidth) and pin the canvas to the exact size
  // (4:5 → 1856×2304, 9:16 → 1080×1920).
  const target = targetForNode(node);
  const liveWidth = node.clientWidth || target.width;
  return toPng(node, {
    ...PNG_OPTIONS,
    pixelRatio: target.width / liveWidth,
    canvasWidth: target.width,
    canvasHeight: target.height,
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

/** Download one rendered creative (found by DOM id) as a 2x PNG. */
export async function downloadCreativeAsPng(nodeId: string, fileName: string): Promise<void> {
  const node = document.getElementById(nodeId);
  if (!node) throw new Error("Не удалось найти креатив на странице.");

  const dataUrl = await nodeToPngDataUrl(node);
  const blob = await dataUrlToBlob(dataUrl);
  saveAs(blob, withPngExtension(fileName));
}

/**
 * Render every ACTIVE creative node (`.creative-export-node`) to PNG,
 * pack them into a ZIP and download `<Project>_creatives.zip`.
 * Returns the number of creatives packed.
 */
export async function downloadActiveCreativesAsZip(projectName: string): Promise<number> {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('.creative-export-node[data-export-scope="active"]'),
  );
  if (nodes.length === 0) return 0;

  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const [index, node] of nodes.entries()) {
    const dataUrl = await nodeToPngDataUrl(node);
    const base64 = dataUrl.split(",")[1];
    if (!base64) continue;

    let fileName = withPngExtension(node.dataset.exportName || `creative-${index + 1}.png`);
    if (usedNames.has(fileName)) {
      fileName = withPngExtension(`creative-${index + 1}`);
    }
    usedNames.add(fileName);
    zip.file(fileName, base64, { base64: true });
  }

  if (usedNames.size === 0) return 0;

  const blob = await zip.generateAsync({ type: "blob" });
  saveAs(blob, `${sanitizeFileName(projectName)}_creatives.zip`);
  return usedNames.size;
}
