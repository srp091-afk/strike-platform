import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { graphJson, metaApp } from "@/lib/instagram";

const GRAPH = "https://graph.facebook.com/v21.0";
const TIMEOUT_MS = 7000;
const MESSAGE_LIMIT = 2000;

export const MESSENGER_OAUTH_COOKIE = "ms_oauth_nonce";
export const MESSENGER_OAUTH_PATH = "/api/integrations/messenger";
export const MESSENGER_PAGES_COOKIE = "ms_page_choices";
export const MESSENGER_PAGES_PATH = "/api";
export const MESSENGER_PAGES_MAX_AGE = 600;

/**
 * pages_show_list — токен страницы.
 * pages_messaging / pages_manage_metadata — отправка и подписка на вебхук.
 * business_management — без него /me/accounts пуст для страниц Meta Business Suite.
 */
export const MESSENGER_SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_metadata", "business_management"] as const;

const PAGE_TARGET_SCOPES = new Set(["pages_show_list", "pages_messaging", "pages_manage_metadata", "pages_read_engagement"]);

export type MessengerResult = { ok: true } | { ok: false; error: string };

export type MessengerPageChoice = { id: string; name: string; accessToken: string };

/** Те же ключи, что у Instagram. FACEBOOK_APP_ID — запасное имя того же приложения STRIKE AI. */
export function messengerApp() {
  const shared = metaApp();
  if (shared) return shared;
  const appId = process.env.FACEBOOK_APP_ID?.trim() ?? "";
  const appSecret = process.env.FACEBOOK_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim() || "";
  return appId && appSecret ? { appId, appSecret } : null;
}

export function messengerAppId() {
  return process.env.META_APP_ID?.trim() || process.env.FACEBOOK_APP_ID?.trim() || "";
}

/** Verify Token того же приложения Meta: общее имя, затем токены Instagram и лидов. */
export function messengerVerifyToken() {
  return process.env.META_VERIFY_TOKEN?.trim() || process.env.INSTAGRAM_VERIFY_TOKEN?.trim() || process.env.FB_VERIFY_TOKEN?.trim() || "";
}

export function messengerRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/integrations/messenger/callback`;
}

/** ID конфигурации «Вход через Facebook для компаний». Без него диалог идёт по списку scope. */
export function messengerLoginConfigId() {
  return process.env.META_LOGIN_CONFIG_ID?.trim() || process.env.FACEBOOK_LOGIN_CONFIG_ID?.trim() || "";
}

type GraphPage = { id?: string; name?: string; access_token?: string };
type TokenDebug = {
  data?: {
    is_valid?: boolean;
    scopes?: string[];
    granular_scopes?: { scope?: string; target_ids?: string[] }[];
  };
};
type PermissionRow = { permission?: string; status?: string };

export type MessengerPageList = { pages: MessengerPageChoice[]; error: string | null };

/**
 * Страницы Business Suite часто не попадают в /me/accounts, хотя пользователь выбрал их в диалоге.
 * Тогда ID лежат в granular_scopes токена, а токен страницы запрашивается напрямую.
 */
export async function listMessengerPages(userToken: string, app: { appId: string; appSecret: string }): Promise<MessengerPageList> {
  const pages = new Map<string, MessengerPageChoice>();
  let accountsError = "";

  try {
    const listed = await graphJson<{ data?: GraphPage[] }>(
      `${GRAPH}/me/accounts?${new URLSearchParams({ fields: "id,name,access_token", limit: "100", access_token: userToken })}`,
    );
    await absorbPages(pages, listed.data ?? [], userToken);
  } catch (error) {
    accountsError = error instanceof Error ? error.message : "Graph не отдал список страниц.";
    console.error("[messenger] /me/accounts", accountsError);
  }

  let debug = { valid: true, scopes: [] as string[], pageIds: [] as string[] };
  if (pages.size === 0) {
    debug = await readTokenDebug(userToken, app);
    for (const pageId of debug.pageIds) {
      const page = await readPage(pageId, userToken);
      if (page) pages.set(page.id, page);
    }
  }
  if (pages.size === 0 && (debug.scopes.includes("business_management") || debug.scopes.length === 0)) {
    try {
      await absorbPages(pages, await pagesOfBusinesses(userToken), userToken);
    } catch (error) {
      console.error("[messenger] businesses", error instanceof Error ? error.message : error);
    }
  }

  if (pages.size > 0) return { pages: [...pages.values()], error: null };

  const info = await readPermissionInfo(userToken, debug);
  const error = explainMissingPages({ ...info, accountsError });
  console.error("[messenger] no pages", JSON.stringify({ scopes: info.scopes, declined: info.declined, targets: debug.pageIds.length, accountsError }));
  return { pages: [], error };
}

export async function sendMessengerMessage(input: { pageAccessToken: string; recipientId: string; text: string }): Promise<MessengerResult> {
  const token = input.pageAccessToken.trim();
  const recipientId = input.recipientId.trim();
  const parts = splitMessengerText(input.text);
  if (!token || !recipientId || parts.length === 0) return { ok: false, error: "Не хватает данных Messenger для отправки." };
  for (const text of parts) {
    const sent = await graphPost(`${GRAPH}/me/messages?access_token=${encodeURIComponent(token)}`, {
      messaging_type: "RESPONSE",
      recipient: { id: recipientId },
      message: { text },
    });
    if (!sent.ok) return sent;
  }
  return { ok: true };
}

export async function subscribePageToApp(pageId: string, pageAccessToken: string): Promise<MessengerResult> {
  const id = pageId.trim();
  const token = pageAccessToken.trim();
  if (!id || !token) return { ok: false, error: "Не хватает страницы или токена Messenger." };
  const body = new URLSearchParams({
    subscribed_fields: "messages,messaging_postbacks,message_echoes",
    access_token: token,
  });
  return graphPost(`${GRAPH}/${id}/subscribed_apps`, body);
}

export async function unsubscribePageFromApp(pageId: string, pageAccessToken: string): Promise<MessengerResult> {
  const id = pageId.trim();
  const token = pageAccessToken.trim();
  if (!id || !token) return { ok: true };
  const url = `${GRAPH}/${id}/subscribed_apps?${new URLSearchParams({ access_token: token })}`;
  try {
    const response = await graphFetch(url, { method: "DELETE" });
    if (!response.ok) return { ok: false, error: await graphError(response) };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error && error.name === "AbortError" ? "Meta не ответила за 7 секунд." : "Не удалось отписать страницу." };
  }
}

export async function getMessengerSenderName(psid: string, pageAccessToken: string) {
  const id = psid.trim();
  const token = pageAccessToken.trim();
  if (!id || !token) return null;
  try {
    const response = await graphFetch(`${GRAPH}/${id}?${new URLSearchParams({ fields: "first_name,last_name", access_token: token })}`);
    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as { first_name?: unknown; last_name?: unknown } | null;
    const name = [body?.first_name, body?.last_name].filter((part): part is string => typeof part === "string" && Boolean(part.trim())).join(" ");
    return name.trim() || null;
  } catch {
    return null;
  }
}

export async function attachMessengerPage(
  admin: SupabaseClient,
  input: { agentId: string; userId: string; pageId: string; pageName: string; pageAccessToken: string },
): Promise<MessengerResult> {
  const pageId = input.pageId.trim();
  const token = input.pageAccessToken.trim();
  if (!pageId || !token) return { ok: false, error: "Выберите страницу Facebook." };
  const { data: taken, error: takenError } = await admin.from("agents").select("id").eq("fb_page_id", pageId).neq("id", input.agentId).maybeSingle();
  if (takenError) return { ok: false, error: messengerColumnError(takenError.message) };
  if (taken) return { ok: false, error: "Эта Facebook-страница уже подключена к другому агенту." };
  const subscribed = await subscribePageToApp(pageId, token);
  if (!subscribed.ok) return subscribed;
  const { error } = await admin
    .from("agents")
    .update({
      fb_page_id: pageId,
      fb_page_name: input.pageName.trim().slice(0, 200) || null,
      fb_page_access_token: token,
      fb_messenger_enabled: true,
    })
    .eq("id", input.agentId)
    .eq("user_id", input.userId);
  if (error) return { ok: false, error: messengerColumnError(error.message) };
  return { ok: true };
}

export function messengerColumnError(message: string) {
  return /fb_page_|fb_messenger_|schema cache/i.test(message) ? "Примените миграцию 20261122_agent_messenger.sql." : message;
}

export function sealMessengerPages(pages: MessengerPageChoice[], secret: string) {
  const payload = Buffer.from(JSON.stringify({ pages, e: Date.now() + MESSENGER_PAGES_MAX_AGE * 1000 }), "utf8").toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function readMessengerPages(value: string | undefined, secret: string): MessengerPageChoice[] {
  if (!value || !secret) return [];
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload, secret))) return [];
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { pages?: MessengerPageChoice[]; e?: number };
    if (typeof parsed.e !== "number" || parsed.e < Date.now() || !Array.isArray(parsed.pages)) return [];
    return parsed.pages.filter((page) => page && typeof page.id === "string" && typeof page.accessToken === "string" && page.accessToken.trim());
  } catch {
    return [];
  }
}

function splitMessengerText(text: string) {
  let rest = text.trim();
  if (!rest) return [];
  const parts: string[] = [];
  while (rest.length > MESSAGE_LIMIT) {
    let cut = rest.lastIndexOf("\n", MESSAGE_LIMIT);
    if (cut < 400) cut = rest.lastIndexOf(" ", MESSAGE_LIMIT);
    if (cut < 400) cut = MESSAGE_LIMIT;
    const piece = rest.slice(0, cut).trim();
    if (piece) parts.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

async function graphPost(url: string, body: unknown): Promise<MessengerResult> {
  try {
    const init: RequestInit =
      body instanceof URLSearchParams
        ? { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const response = await graphFetch(url, init);
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!response.ok || payload?.error) {
      const message = payload?.error?.message?.trim();
      return { ok: false, error: message ? message.slice(0, 300) : `Meta ответила ${response.status}.` };
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false, error: "Meta не ответила за 7 секунд." };
    return { ok: false, error: "Не удалось связаться с Meta." };
  }
}

function graphFetch(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function graphError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  const message = body?.error?.message?.trim();
  return message ? message.slice(0, 300) : `Meta ответила ${response.status}.`;
}

async function absorbPages(target: Map<string, MessengerPageChoice>, nodes: GraphPage[], userToken: string) {
  for (const node of nodes) {
    if (!node.id || target.has(node.id)) continue;
    if (node.access_token) {
      target.set(node.id, { id: node.id, name: pageName(node.name), accessToken: node.access_token });
      continue;
    }
    const page = await readPage(node.id, userToken);
    if (page) target.set(page.id, page);
  }
}

async function readPage(pageId: string, userToken: string): Promise<MessengerPageChoice | null> {
  try {
    const page = await graphJson<GraphPage>(
      `${GRAPH}/${pageId}?${new URLSearchParams({ fields: "id,name,access_token", access_token: userToken })}`,
    );
    if (!page.id || !page.access_token) return null;
    return { id: page.id, name: pageName(page.name), accessToken: page.access_token };
  } catch (error) {
    console.error("[messenger] page", pageId, error instanceof Error ? error.message : error);
    return null;
  }
}

async function pagesOfBusinesses(userToken: string) {
  const businesses = await graphJson<{ data?: { id?: string }[] }>(
    `${GRAPH}/me/businesses?${new URLSearchParams({ fields: "id", limit: "25", access_token: userToken })}`,
  );
  const nodes: GraphPage[] = [];
  for (const business of businesses.data ?? []) {
    if (!business.id) continue;
    for (const edge of ["owned_pages", "client_pages"]) {
      try {
        const listed = await graphJson<{ data?: GraphPage[] }>(
          `${GRAPH}/${business.id}/${edge}?${new URLSearchParams({ fields: "id,name,access_token", limit: "50", access_token: userToken })}`,
        );
        nodes.push(...(listed.data ?? []));
      } catch (error) {
        console.error("[messenger]", edge, error instanceof Error ? error.message : error);
      }
    }
  }
  return nodes;
}

async function readTokenDebug(userToken: string, app: { appId: string; appSecret: string }) {
  const empty = { valid: true, scopes: [] as string[], pageIds: [] as string[] };
  try {
    const debug = await graphJson<TokenDebug>(
      `${GRAPH}/debug_token?${new URLSearchParams({ input_token: userToken, access_token: `${app.appId}|${app.appSecret}` })}`,
    );
    const granular = debug.data?.granular_scopes ?? [];
    const pageIds = [...new Set(granular.filter((item) => PAGE_TARGET_SCOPES.has(item.scope ?? "")).flatMap((item) => item.target_ids ?? []))];
    return { valid: debug.data?.is_valid !== false, scopes: debug.data?.scopes ?? [], pageIds };
  } catch (error) {
    console.error("[messenger] debug_token", error instanceof Error ? error.message : error);
    return empty;
  }
}

async function readPermissionInfo(userToken: string, debug: { valid: boolean; scopes: string[]; pageIds: string[] }) {
  try {
    const response = await graphJson<{ data?: PermissionRow[] }>(`${GRAPH}/me/permissions?${new URLSearchParams({ access_token: userToken })}`);
    const rows = response.data ?? [];
    const granted = rows.filter((row) => row.status === "granted" && row.permission).map((row) => row.permission!);
    const declined = rows.filter((row) => row.status === "declined" && row.permission).map((row) => row.permission!);
    return { valid: debug.valid, scopes: granted.length > 0 ? granted : debug.scopes, declined, pageIds: debug.pageIds };
  } catch (error) {
    console.error("[messenger] permissions", error instanceof Error ? error.message : error);
    return { valid: debug.valid, scopes: debug.scopes, declined: [] as string[], pageIds: debug.pageIds };
  }
}

function explainMissingPages(info: { valid: boolean; scopes: string[]; declined: string[]; pageIds: string[]; accountsError: string }) {
  if (!info.valid) return "Токен Facebook недействителен. Подключите страницу ещё раз.";
  const granted = info.scopes.length > 0 ? info.scopes.join(", ") : "нет";
  if (info.declined.includes("pages_show_list") || !info.scopes.includes("pages_show_list")) {
    return `Meta пустила в аккаунт, но не выдала список страниц (права: ${granted}). Для «Вход через Facebook для компаний» создайте конфигурацию User access token с активом Pages и правами pages_show_list, pages_messaging, pages_manage_metadata, business_management, затем укажите её ID в META_LOGIN_CONFIG_ID.`;
  }
  if (info.pageIds.length > 0) {
    return `Meta отметила ${info.pageIds.length} стр., но не отдала токен страницы. Нужна роль администратора страницы у этого профиля Facebook.`;
  }
  if (!info.scopes.includes("business_management")) {
    return "Страницы Business Suite не приходят без права business_management. Добавьте его в конфигурацию входа и подключите Facebook ещё раз.";
  }
  if (info.accountsError) return `Meta не отдала страницы: ${info.accountsError}`.slice(0, 300);
  return "Право на страницы выдано, но Meta вернула пустой список. Войдите профилем, который администратор страницы в Business Settings, а не только видит её в кабинете приложения.";
}

function pageName(name: string | undefined) {
  return name?.trim() || "Facebook";
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
