import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import * as cheerio from "cheerio";

export const SCRAPE_MAX_CHARS = 5000;

const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

/** Публичный демо-эндпоинт ходит по ссылкам от анонимов — внутренние адреса закрываем (SSRF). */
function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const value = mapped ? mapped[1]! : address.toLowerCase();

  if (isIP(value) === 4) {
    const [a, b] = value.split(".").map(Number) as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (isIP(value) === 6) {
    return value === "::" || value === "::1" || /^f[cd]/.test(value) || /^fe[89ab]/.test(value);
  }
  return true;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Unsupported protocol");
  if (url.username || url.password) throw new Error("Credentials in URL are not allowed");
  if (url.port && url.port !== "80" && url.port !== "443") throw new Error("Unsupported port");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Private host");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((item) => isPrivateAddress(item.address))) {
    throw new Error("Private address");
  }
  return url;
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

// Клиент шлёт ссылку с каждой репликой — не скачиваем один и тот же сайт заново (кэш в памяти инстанса).
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 100;
const cache = new Map<string, { at: number; text: string }>();

/** Достаёт читаемый текст страницы без скриптов и стилей. Возвращает null, если сайт недоступен или не HTML. */
export async function scrapeWebsite(rawUrl: string): Promise<string | null> {
  const key = rawUrl.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.text;

  const text = await scrapeUncached(rawUrl);
  if (text) {
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), text });
  }
  return text;
}

async function scrapeUncached(rawUrl: string): Promise<string | null> {
  try {
    let url = await assertPublicUrl(rawUrl.trim());
    let response: Response | null = null;

    // Редиректы ведём вручную: каждый следующий адрес тоже должен быть публичным.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; STRIKE-Demo/1.0)", Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        url = await assertPublicUrl(new URL(location, url).toString());
        continue;
      }
      break;
    }

    if (!response || !response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text/plain")) return null;

    const $ = cheerio.load(await readLimited(response));
    $("script, style, noscript, svg, iframe, template, nav, footer, form, [aria-hidden='true']").remove();

    const title = $("title").first().text().trim();
    const description = $('meta[name="description"]').attr("content")?.trim() ?? "";
    const body = $("body").text().replace(/\s+/g, " ").trim();

    const text = [title && `Заголовок: ${title}`, description && `Описание: ${description}`, body]
      .filter(Boolean)
      .join("\n")
      .slice(0, SCRAPE_MAX_CHARS);
    return text.length >= 40 ? text : null;
  } catch {
    return null;
  }
}
