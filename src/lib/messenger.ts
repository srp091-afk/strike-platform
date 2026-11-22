import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { metaApp } from "@/lib/instagram";

const GRAPH = "https://graph.facebook.com/v21.0";
const TIMEOUT_MS = 7000;
const MESSAGE_LIMIT = 2000;

export const MESSENGER_OAUTH_COOKIE = "ms_oauth_nonce";
export const MESSENGER_OAUTH_PATH = "/api/integrations/messenger";
export const MESSENGER_PAGES_COOKIE = "ms_page_choices";
export const MESSENGER_PAGES_PATH = "/api";
export const MESSENGER_PAGES_MAX_AGE = 600;

export const MESSENGER_SCOPES = ["pages_show_list", "pages_messaging", "pages_manage_metadata"] as const;

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

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
