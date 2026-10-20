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
 * crossOrigin="anonymous"). Keep pixelRatio at 2 for a crisp 2x PNG.
 */
const PNG_OPTIONS = {
  pixelRatio: 2,
  fetchRequestInit: {
    mode: "cors" as RequestMode,
    credentials: "omit" as RequestCredentials,
  },
};

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
  return toPng(node, PNG_OPTIONS);
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
