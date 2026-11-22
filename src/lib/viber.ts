import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const TIMEOUT_MS = 7000;

export type ViberResult = { ok: true } | { ok: false; error: string };

/** Пустая строка — токен не менять. null — токен с пробелами или слишком короткий. */
export function readViberToken(value: string) {
  if (!value.trim()) return "";
  const token = value.trim();
  if (/\s/.test(value) || token.length < 20 || token.length > 200) return null;
  return token;
}

/** Имя отправителя в Viber не длиннее 28 символов. Пустая строка — брать имя агента. */
export function readViberBotName(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, 28);
}

export function verifyViberSignature(rawBody: string, signatureHeader: string, authToken: string) {
  const signature = signatureHeader.trim().toLowerCase();
  if (!signature || !authToken) return false;
  const expected = createHmac("sha256", authToken).update(Buffer.from(rawBody)).digest("hex");
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function setViberWebhook(authToken: string, webhookUrl: string): Promise<ViberResult> {
  const token = authToken.trim();
  if (!token || !webhookUrl.trim()) return { ok: false, error: "Не хватает токена Viber или адреса вебхука." };
  const payload = await viberPost(token, "https://chatapi.viber.com/pa/set_webhook", {
    url: webhookUrl,
    event_types: ["message", "conversation_started"],
    send_name: true,
    send_photo: false,
  });
  return payload;
}

export async function sendViberMessage(input: {
  authToken: string;
  receiver: string;
  text: string;
  senderName: string;
}): Promise<ViberResult> {
  const token = input.authToken.trim();
  const receiver = input.receiver.trim();
  const text = input.text.trim().slice(0, 7000);
  const senderName = (input.senderName.trim() || "Ассистент").slice(0, 28);
  if (!token || !receiver || !text) return { ok: false, error: "Не хватает данных Viber для отправки сообщения." };
  return viberPost(token, "https://chatapi.viber.com/pa/send_message", {
    receiver,
    min_api_version: 1,
    sender: { name: senderName },
    type: "text",
    text,
  });
}

async function viberPost(authToken: string, url: string, body: unknown): Promise<ViberResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Viber-Auth-Token": authToken },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as { status?: unknown; status_message?: unknown } | null;
    if (!response.ok || payload?.status !== 0) {
      const message = typeof payload?.status_message === "string" && payload.status_message.trim() ? payload.status_message.trim() : "";
      return { ok: false, error: message || `Viber ответил ${response.status}.` };
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return { ok: false, error: "Viber не ответил за 7 секунд." };
    return { ok: false, error: "Не удалось связаться с Viber." };
  } finally {
    clearTimeout(timer);
  }
}
