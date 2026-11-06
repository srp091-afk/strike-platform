import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const GRAPH = "https://graph.facebook.com/v21.0";

/** Валидные права Meta Login for Business: директ-сообщения, список страниц (токен страницы) и базовый профиль. */
/** Можно переопределить через INSTAGRAM_SCOPES (через запятую), когда в приложении Meta добавлены нужные права. */
export const INSTAGRAM_SCOPES = (process.env.INSTAGRAM_SCOPES ?? "")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);
if (INSTAGRAM_SCOPES.length === 0) INSTAGRAM_SCOPES.push("instagram_manage_messages", "pages_show_list", "pages_read_engagement", "public_profile");

export const OAUTH_COOKIE = "ig_oauth_nonce";
export const OAUTH_COOKIE_PATH = "/api/auth/instagram";

export function metaApp() {
  const appId = process.env.META_APP_ID?.trim() ?? "";
  const appSecret = process.env.META_APP_SECRET?.trim() ?? "";
  return appId && appSecret ? { appId, appSecret } : null;
}

export function redirectUri(origin: string) {
  const base = (process.env.META_REDIRECT_URI?.trim() || `${origin}/api/auth/instagram/callback`).replace(/\/$/, "");
  return base;
}

function b64url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export type OAuthState = { a: string; u: string; n: string; e: number };

/** Подписанный state: агент, пользователь, одноразовый nonce (дублируется в httpOnly cookie) и срок жизни 10 минут. */
export function createState(agentId: string, userId: string, secret: string) {
  const nonce = randomBytes(16).toString("hex");
  const payload = b64url(JSON.stringify({ a: agentId, u: userId, n: nonce, e: Date.now() + 10 * 60 * 1000 } satisfies OAuthState));
  return { nonce, state: `${payload}.${sign(payload, secret)}` };
}

export function readState(state: string, secret: string): OAuthState | null {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = sign(payload, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
    if (typeof parsed.a !== "string" || typeof parsed.u !== "string" || typeof parsed.n !== "string") return null;
    if (typeof parsed.e !== "number" || parsed.e < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Проверка подписи вебхука Meta: X-Hub-Signature-256 = sha256(HMAC(app secret, raw body)). */
export function verifySignature(rawBody: string, header: string | null, secret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const given = header.slice("sha256=".length);
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Ошибка Graph API без токенов и лишних деталей. */
export async function graphJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  const body = (await response.json().catch(() => null)) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !body || body.error) {
    throw new Error(body?.error?.message ?? `Graph API ${response.status}`);
  }
  return body;
}