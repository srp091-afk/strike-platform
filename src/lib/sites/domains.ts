export const RESERVED_SUBDOMAINS = [
  "www",
  "app",
  "api",
  "admin",
  "auth",
  "mail",
  "smtp",
  "cdn",
  "static",
  "assets",
  "billing",
  "docs",
  "help",
  "support",
  "status",
  "blog",
  "strike",
  "strikeplatform",
  "test",
  "staging",
  "dev",
] as const;

const RESERVED = new Set<string>(RESERVED_SUBDOMAINS);
const SUBDOMAIN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

const APP_HOSTS = new Set(["strikeplatform.io", "www.strikeplatform.io", "localhost", "127.0.0.1"]);

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function hostName(value: string) {
  return value.split(":")[0]?.trim().toLowerCase() ?? "";
}

export function isAppHost(host: string) {
  const name = hostName(host);
  return APP_HOSTS.has(name) || name.endsWith(".vercel.app") || name.endsWith(".localhost");
}

export function subdomainFromHost(host: string) {
  const name = hostName(host);
  const suffix = ".strikeplatform.io";
  if (!name.endsWith(suffix)) return null;
  const sub = name.slice(0, -suffix.length);
  if (!sub || sub.includes(".") || RESERVED.has(sub)) return null;
  return sub;
}

export function isCustomSiteHost(host: string) {
  const name = hostName(host);
  if (!name || isAppHost(name) || name.endsWith(".strikeplatform.io")) return false;
  return name.includes(".");
}

export function normalizeSubdomain(raw: string): { ok: true; slug: string } | { ok: false; reason: string } {
  const slug = raw
    .trim()
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  if (slug.length < 3) return { ok: false, reason: "Минимум 3 символа: латиница, цифры и дефис." };
  if (!SUBDOMAIN.test(slug)) return { ok: false, reason: "Дефис не может быть в начале или в конце." };
  if (RESERVED.has(slug)) return { ok: false, reason: "Это имя занято платформой." };
  return { ok: true, slug };
}

const SLUG_STOP = new Set(["kviz", "dlya", "i", "s", "po", "na", "v", "iz", "the", "of", "and", "raschet", "raschyota", "rascheta", "stoimost", "stoimosti", "podbor", "podbora", "quiz"]);

export function compactSubdomain(raw: string) {
  const normalized = normalizeSubdomain(raw);
  const source = normalized.ok ? normalized.slug : "quiz-site";
  const words = source.split("-").filter((word) => word && !SLUG_STOP.has(word));
  const picked = (words.length > 0 ? words : source.split("-").filter(Boolean)).slice(0, 3);
  let slug = picked.join("-");
  while (slug.length > 22 && picked.length > 1) {
    picked.pop();
    slug = picked.join("-");
  }
  slug = slug.slice(0, 22).replace(/-+$/g, "");
  const check = normalizeSubdomain(slug.length >= 3 ? slug : "quiz-site");
  return check.ok ? check.slug : "quiz-site";
}

export function normalizeCustomDomain(raw: string): { ok: true; domain: string } | { ok: false; reason: string } {
  const domain = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
    return { ok: false, reason: "Укажите домен без протокола, например myagency.com." };
  }
  if (domain === "strikeplatform.io" || domain.endsWith(".strikeplatform.io")) {
    return { ok: false, reason: "Для адресов STRIKE используйте субдомен." };
  }
  return { ok: true, domain };
}

export function brandHost(subdomain: string) {
  return `${subdomain}.strikeplatform.io`;
}

export function publicSiteUrl(subdomain: string, path = "") {
  const suffix = path.replace(/^\/+|\/+$/g, "");
  const host = `https://${brandHost(subdomain)}`;
  return suffix ? `${host}/${suffix}` : host;
}

/** Запасной адрес на основном домене, пока wildcard DNS не разъехался. */
export function fallbackSitePath(subdomain: string, path = "") {
  const suffix = path.replace(/^\/+|\/+$/g, "");
  return suffix ? `/${subdomain}/${suffix}` : `/${subdomain}`;
}

export function internalSitePath(subdomain: string, path = "") {
  const suffix = path.replace(/^\/+|\/+$/g, "");
  return suffix ? `/s/${subdomain}/${suffix}` : `/s/${subdomain}`;
}

const PLATFORM_SEGMENTS = new Set([
  "dashboard",
  "billing",
  "agents",
  "funnels",
  "sites",
  "ads",
  "leads",
  "chats",
  "ai-tasks",
  "settings",
  "playground",
  "test-creatives",
  "smm",
  "login",
  "pricing",
  "privacy",
  "terms",
  "refund",
  "demo",
  "widget",
  "auth",
  "actions",
  "api",
  "l",
  "f",
  "s",
  "s-host",
  "favicon.ico",
  "robots.txt",
  "manifest.webmanifest",
]);

function decodeSegment(value: string) {
  try {
    return decodeURIComponent(value).toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

/** Путь вида /<компания> или /<компания>/<страница> на основном домене, если имя не занято кабинетом. */
export function apexSiteSlug(pathname: string) {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const raw = decodeSegment(parts[0] ?? "");
  if (!raw || raw.includes(".") || PLATFORM_SEGMENTS.has(raw)) return null;
  if (!SUBDOMAIN.test(raw) || RESERVED.has(raw)) return null;
  return { slug: raw, path: parts.slice(1).map(decodeSegment).join("/") };
}
