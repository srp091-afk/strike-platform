import "server-only";

const JINA_BASE = "https://r.jina.ai/";
const MAX_CHARS = 12_000;

export function normalizeSiteUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    return url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Jina Reader: сайт -> чистый Markdown (без HTML-мусора, экономит токены). */
export async function fetchSiteMarkdown(rawUrl: string): Promise<{ ok: true; markdown: string; url: string } | { ok: false; error: string }> {
  const url = normalizeSiteUrl(rawUrl);
  if (!url) return { ok: false, error: "Некорректный адрес сайта" };

  const headers: Record<string, string> = { Accept: "text/plain", "X-Return-Format": "markdown" };
  if (process.env.JINA_API_KEY) headers.Authorization = `Bearer ${process.env.JINA_API_KEY}`;

  try {
    const response = await fetch(`${JINA_BASE}${url}`, { headers, signal: AbortSignal.timeout(25_000), cache: "no-store" });
    if (!response.ok) return { ok: false, error: `Сайт недоступен (Jina ${response.status})` };
    const text = (await response.text()).trim();
    if (text.length < 40) return { ok: false, error: "Сайт не вернул читаемого контента" };
    return { ok: true, markdown: text.slice(0, MAX_CHARS), url };
  } catch {
    return { ok: false, error: "Не удалось загрузить сайт (таймаут или сеть)" };
  }
}
