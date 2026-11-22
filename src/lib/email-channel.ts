import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";

import { isBotPauseActive, readMessageLimit } from "@/lib/agent-models";
import { pauseIfDialogueOverLimit } from "@/lib/bot-state";
import { openChannelConversation } from "@/lib/channel-inbox";
import { completeChannelReply } from "@/lib/channel-turn";
import { replyChunks, sleep, splitPauseMs, stripMarkdown } from "@/lib/reply";

const CONNECT_MS = 15000;

export type EmailConfig = {
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
};

export type EmailTestResult = { ok: true } | { ok: false; error: string };

/** Пустая строка — адреса нет. null — адрес не похож на почту. */
export function readMailAddress(value: string) {
  const email = value.trim().toLowerCase();
  if (!email) return "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return null;
  return email;
}

/** Пустая строка — хост не задан. null — в хосте есть пробелы или лишние символы. */
export function readMailHost(value: string) {
  const host = value.trim().toLowerCase();
  if (!host) return "";
  if (!/^[a-z0-9.-]{1,253}$/.test(host) || host.startsWith(".") || host.endsWith(".")) return null;
  return host;
}

/** Пустая строка даёт порт по умолчанию. null — порт вне диапазона 1–65535. */
export function readMailPort(value: string, fallback: number) {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  if (!/^\d{1,5}$/.test(trimmed)) return null;
  const port = Number(trimmed);
  if (port < 1 || port > 65535) return null;
  return port;
}

/** Пустая строка — пароль не менять. Внутренние пробелы сохраняются: так устроены пароли приложений. */
export function readMailPassword(value: string) {
  if (!value.trim()) return "";
  if (value.length > 500) return null;
  return value;
}

export async function testEmailConnection(config: EmailConfig): Promise<EmailTestResult> {
  const ready = validateConfig(config);
  if (!ready.ok) return ready;
  try {
    await withTimeout(checkImap(config), "Почтовый сервер не ответил вовремя.");
    await withTimeout(checkSmtp(config), "SMTP-сервер не ответил вовремя.");
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось подключиться к почте.";
    return { ok: false, error: friendlyMailError(message) };
  }
}

export async function sendEmailReply(input: {
  config: EmailConfig;
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string | null;
}) {
  const ready = validateConfig(input.config);
  if (!ready.ok) return ready;
  const to = input.to.trim();
  const text = input.text.trim();
  if (!to || !text) return { ok: false as const, error: "Не хватает адреса или текста письма." };
  const subject = replySubject(input.subject);
  try {
    const transporter = smtpTransport(input.config);
    const sent = await transporter.sendMail({
      from: input.config.email,
      to,
      subject,
      text,
      ...(input.inReplyTo ? { inReplyTo: input.inReplyTo, references: input.references || input.inReplyTo } : {}),
    });
    return { ok: true as const, messageId: typeof sent.messageId === "string" ? sent.messageId : null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить письмо.";
    return { ok: false as const, error: friendlyMailError(message) };
  }
}

type InboxAgent = {
  id: string;
  user_id: string;
  name: string | null;
  system_prompt: string | null;
  model: string | null;
  temperature: number | null;
  is_active: boolean | null;
  split_messages: boolean | null;
  limit_agent_messages: number | null;
  limit_client_messages: number | null;
  limit_total_messages: number | null;
  email_address: string | null;
  email_password: string | null;
  email_imap_host: string | null;
  email_imap_port: number | null;
  email_smtp_host: string | null;
  email_smtp_port: number | null;
  email_last_uid: number | string | null;
};

/** Забирает новые письма. Первый запуск только запоминает текущий UID и не отвечает на старую почту. */
export async function pollAgentInbox(supabase: SupabaseClient, agent: InboxAgent) {
  const config = configFromAgent(agent);
  if (!config) return;
  const client = imapClient(config);
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const mailbox = client.mailbox;
    const uidNext = mailbox && typeof mailbox === "object" ? Number(mailbox.uidNext ?? 1) : 1;
    const highest = Number.isFinite(uidNext) ? Math.max(0, uidNext - 1) : 0;
    if (agent.email_last_uid == null || agent.email_last_uid === "") {
      await rememberUid(supabase, agent.id, highest);
      return;
    }
    const lastUid = Number(agent.email_last_uid);
    if (!Number.isFinite(lastUid) || lastUid >= highest) return;

    let cursor = lastUid;
    for await (const message of client.fetch(`${lastUid + 1}:*`, { uid: true, envelope: true, source: true, headers: ["auto-submitted", "x-autoreply"] }, { uid: true })) {
      const uid = Number(message.uid);
      if (!Number.isFinite(uid) || uid <= cursor) continue;
      try {
        await handleMail(supabase, agent, config, message);
        cursor = uid;
        await rememberUid(supabase, agent.id, cursor);
      } catch (error) {
        console.error("[email poll] message", agent.id, uid, error instanceof Error ? error.message : error);
        break;
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}

async function handleMail(
  supabase: SupabaseClient,
  agent: InboxAgent,
  config: EmailConfig,
  message: { uid: number; envelope?: { from?: Array<{ address?: string; name?: string }>; subject?: string; messageId?: string }; source?: Buffer; headers?: Buffer },
) {
  const from = message.envelope?.from?.[0];
  const sender = (from?.address ?? "").trim().toLowerCase();
  const subject = (message.envelope?.subject ?? "").trim().slice(0, 300);
  const messageId = (message.envelope?.messageId ?? "").trim();
  if (!sender || shouldSkipMail(sender, config.email, headerText(message.headers))) return;

  const text = stripQuotedReply(extractPlainText(message.source)).slice(0, 8000);
  if (!text) return;

  const senderName = (from?.name ?? "").trim().slice(0, 120) || sender;
  const conversation = await openChannelConversation(supabase, {
    userId: agent.user_id,
    agentId: agent.id,
    provider: "email",
    externalChatId: sender,
    contactName: senderName,
    preview: text,
  });
  let inboundStored = false;
  if (messageId) {
    const existing = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("external_message_id", messageId)
      .limit(1)
      .maybeSingle();
    if (existing.data?.id) {
      const latest = await supabase
        .from("messages")
        .select("role")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latest.data?.role !== "user") return;
      inboundStored = true;
    }
  }
  if (!inboundStored) {
    const { error: inboundError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "user",
      content: text,
      status: "sent",
      ...(messageId ? { external_message_id: messageId } : {}),
    });
    if (inboundError) throw new Error(inboundError.message);
    await markClient(supabase, conversation.id);
  }

  if (agent.is_active !== true || !conversation.botActive) return;
  const { data: pause } = await supabase.from("conversations").select("bot_paused_until").eq("id", conversation.id).maybeSingle();
  if (isBotPauseActive(pause?.bot_paused_until)) return;
  if (
    await pauseIfDialogueOverLimit(supabase, conversation.id, {
      agent: readMessageLimit(agent.limit_agent_messages),
      client: readMessageLimit(agent.limit_client_messages),
      total: readMessageLimit(agent.limit_total_messages),
    })
  ) {
    return;
  }

  const completion = await completeChannelReply({
    supabase,
    agent,
    conversationId: conversation.id,
    channel: "email",
    chatId: sender,
    clientName: senderName,
    question: text,
  });
  if (!completion.text || completion.paused) return;

  const chunks = replyChunks(completion.text, agent.split_messages);
  let preview = chunks[0] ?? completion.text;
  let replied = false;
  for (const [index, chunk] of chunks.entries()) {
    if (index > 0) await sleep(splitPauseMs());
    const plain = stripMarkdown(chunk).trim();
    if (!plain) continue;
    const sent = await sendEmailReply({
      config,
      to: sender,
      subject,
      text: plain,
      inReplyTo: messageId || null,
      references: messageId || null,
    });
    if (!sent.ok) throw new Error(sent.error);
    const { error: storedError } = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      role: "assistant",
      content: plain,
      status: "sent",
      ...(sent.messageId ? { external_message_id: sent.messageId } : {}),
    });
    if (storedError) throw new Error(storedError.message);
    preview = plain;
    replied = true;
  }
  await supabase
    .from("conversations")
    .update({ last_message_preview: preview.slice(0, 140), last_message_at: new Date().toISOString(), agent_id: agent.id })
    .eq("id", conversation.id);
  if (replied) await markAgent(supabase, conversation.id);
}

function shouldSkipMail(sender: string, ownAddress: string, headers: string) {
  if (sender === ownAddress.trim().toLowerCase()) return true;
  if (/noreply|no-reply|mailer-daemon/.test(sender)) return true;
  const autoSubmitted = headerValue(headers, "auto-submitted");
  if (autoSubmitted && autoSubmitted.toLowerCase() !== "no") return true;
  if (headerValue(headers, "x-autoreply")) return true;
  return false;
}

function headerText(value: Buffer | undefined) {
  return value ? value.toString("utf8") : "";
}

function headerValue(raw: string, name: string) {
  const match = new RegExp(`^${name}:\\s*(.+)$`, "im").exec(raw);
  return match?.[1]?.trim() ?? "";
}

function extractPlainText(source: Buffer | undefined) {
  if (!source || source.length === 0) return "";
  const raw = source.toString("utf8");
  const plain = multipartPart(raw, "text/plain");
  if (plain) return decodePart(plain.head, plain.body);
  if (!/content-type:\s*multipart/i.test(raw.slice(0, 2000))) {
    const split = splitHead(raw);
    const type = /content-type:\s*([^;\s]+)/i.exec(split.head)?.[1]?.toLowerCase() ?? "text/plain";
    const decoded = decodePart(split.head, split.body);
    return type.includes("html") ? stripHtml(decoded) : decoded;
  }
  const html = multipartPart(raw, "text/html");
  return html ? stripHtml(decodePart(html.head, html.body)) : "";
}

function multipartPart(raw: string, mime: string) {
  const parts = raw.split(/\r?\n--/);
  for (const part of parts) {
    if (!new RegExp(`content-type:\\s*${mime}`, "i").test(part)) continue;
    const split = splitHead(part);
    return split;
  }
  return null;
}

function splitHead(part: string) {
  const match = /\r?\n\r?\n/.exec(part);
  if (!match || match.index == null) return { head: part, body: "" };
  return { head: part.slice(0, match.index), body: part.slice(match.index + match[0].length) };
}

function decodePart(head: string, body: string) {
  const encoding = /content-transfer-encoding:\s*([^\s;]+)/i.exec(head)?.[1]?.toLowerCase() ?? "7bit";
  const charset = /charset="?([^";\s]+)/i.exec(head)?.[1]?.toLowerCase() ?? "utf-8";
  if (encoding === "base64") return decodeBytes(Buffer.from(body.replace(/\s/g, ""), "base64"), charset);
  if (encoding === "quoted-printable") return decodeBytes(Buffer.from(decodeQuotedPrintable(body)), charset);
  return body;
}

function decodeQuotedPrintable(input: string) {
  const bytes: number[] = [];
  const soft = input.replace(/=\r?\n/g, "");
  for (let index = 0; index < soft.length; index += 1) {
    if (soft[index] === "=" && /^[0-9a-f]{2}$/i.test(soft.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(soft.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(soft.charCodeAt(index) & 0xff);
    }
  }
  return bytes;
}

function decodeBytes(bytes: Buffer, charset: string) {
  const label = charset === "windows-1251" || charset === "cp1251" || charset === "koi8-r" ? charset : "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripQuotedReply(value: string) {
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const cut = lines.findIndex((line, index) => {
    if (index === 0) return false;
    const trimmed = line.trim();
    return (
      /^on .+wrote:\s*$/i.test(trimmed) ||
      /^-{2,}\s*original message\s*-{2,}$/i.test(trimmed) ||
      /^-{5,}$/.test(trimmed) ||
      /^_{5,}$/.test(trimmed) ||
      /^>{1,}\s?/.test(trimmed) ||
      /писал\(а\)?:?\s*$/i.test(trimmed) ||
      /^от:\s.+/i.test(trimmed)
    );
  });
  return (cut === -1 ? lines : lines.slice(0, cut)).join("\n").trim();
}

function replySubject(subject: string) {
  const clean = subject.trim() || "ваше письмо";
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

function configFromAgent(agent: InboxAgent): EmailConfig | null {
  const email = (agent.email_address ?? "").trim().toLowerCase();
  const password = agent.email_password ?? "";
  const imapHost = (agent.email_imap_host ?? "").trim();
  const smtpHost = (agent.email_smtp_host ?? "").trim();
  if (!email || !password.trim() || !imapHost || !smtpHost) return null;
  return {
    email,
    password,
    imapHost,
    imapPort: Number(agent.email_imap_port) || 993,
    smtpHost,
    smtpPort: Number(agent.email_smtp_port) || 465,
  };
}

function validateConfig(config: EmailConfig): EmailTestResult {
  if (readMailAddress(config.email) !== config.email.trim().toLowerCase()) return { ok: false, error: "Укажите корректный email." };
  if (!config.password.trim()) return { ok: false, error: "Укажите пароль приложения." };
  if (!readMailHost(config.imapHost)) return { ok: false, error: "Укажите IMAP-хост." };
  if (!readMailHost(config.smtpHost)) return { ok: false, error: "Укажите SMTP-хост." };
  return { ok: true };
}

function imapClient(config: EmailConfig) {
  return new ImapFlow({
    host: config.imapHost,
    port: config.imapPort,
    secure: config.imapPort === 993,
    auth: { user: config.email, pass: config.password },
    logger: false,
    connectionTimeout: CONNECT_MS,
    greetingTimeout: CONNECT_MS,
    socketTimeout: 20000,
  });
}

function smtpTransport(config: EmailConfig) {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: { user: config.email, pass: config.password },
    connectionTimeout: CONNECT_MS,
    greetingTimeout: CONNECT_MS,
    socketTimeout: 20000,
  });
}

async function checkImap(config: EmailConfig) {
  const client = imapClient(config);
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  lock.release();
  await client.logout();
}

async function checkSmtp(config: EmailConfig) {
  await smtpTransport(config).verify();
}

async function withTimeout<T>(promise: Promise<T>, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), CONNECT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function friendlyMailError(message: string) {
  if (/auth|invalid credentials|authentication|login/i.test(message)) return "Почта не приняла логин или пароль приложения.";
  if (/timeout|timed out|не ответил/i.test(message)) return "Почтовый сервер не ответил вовремя.";
  if (/ENOTFOUND|getaddrinfo/i.test(message)) return "Хост почты не найден. Проверьте IMAP и SMTP.";
  return message.slice(0, 300);
}

async function rememberUid(supabase: SupabaseClient, agentId: string, uid: number) {
  const { error } = await supabase.from("agents").update({ email_last_uid: uid }).eq("id", agentId);
  if (error) console.error("[email poll] uid", error.message);
}

async function markClient(supabase: SupabaseClient, conversationId: string) {
  const { markClientReplied } = await import("@/lib/followup");
  await markClientReplied(supabase, conversationId);
}

async function markAgent(supabase: SupabaseClient, conversationId: string) {
  const { markAgentReplied } = await import("@/lib/followup");
  await markAgentReplied(supabase, conversationId);
}
