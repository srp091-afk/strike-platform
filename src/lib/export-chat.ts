import type { ChatAgentOption, ChatMessage, ChatThread } from "@/lib/chat-types";
import { channelLabel } from "@/lib/integration-catalog";

/**
 * Экспорт истории диалога в автономный HTML-файл с фирменным стилем STRIKE:
 * тёмная тема (#0a0a0a / #171717), акцент #dd0005 у сообщений агента.
 * Файл самодостаточен (весь CSS инлайн), открывается в любом браузере.
 */

export function generateChatHtml(
  dialog: ChatThread,
  messages: ChatMessage[],
  agent: Pick<ChatAgentOption, "name"> | null | undefined,
): string {
  const visible = messages.filter((message) => message.role === "user" || message.role === "assistant" || message.role === "system");
  const firstAt = visible.length > 0 ? visible[0].createdAt : null;
  const lastAt = visible.length > 0 ? visible[visible.length - 1].createdAt : null;

  const meta: Array<[string, string]> = [
    ["ID диалога", dialog.id],
    ["Канал", channelLabel(dialog.provider)],
    ["Имя агента", agent?.name || "—"],
    ["Количество сообщений", String(visible.length)],
    ["Длительность", formatDuration(firstAt, lastAt)],
    // Точного учёта токенов в сообщениях нет — оценка по средней длине сообщения.
    ["Количество токенов", `~${visible.length * 250}`],
    ["Дата начала", formatDateTime(firstAt)],
    ["Дата завершения", formatDateTime(lastAt)],
  ];

  const metaHtml = meta
    .map(
      ([label, value]) => `
        <div class="meta-item">
          <div class="meta-label">${escapeHtml(label)}</div>
          <div class="meta-value">${escapeHtml(value)}</div>
        </div>`,
    )
    .join("");

  const messagesHtml = visible.length
    ? visible.map(renderMessage).join("")
    : `<p class="empty">В этом диалоге пока нет сообщений.</p>`;

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Диалог ${escapeHtml(dialog.id)} — STRIKE</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #0a0a0a;
    color: #f4f4f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
  }
  .wrap { max-width: 880px; margin: 0 auto; padding: 32px 20px 48px; }
  header {
    background: #171717;
    border: 1px solid #262626;
    border-radius: 16px;
    padding: 24px;
    margin-bottom: 24px;
  }
  .logo {
    color: #ffffff;
    font-size: 20px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.35em;
    margin: 0 0 20px;
  }
  .meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }
  .meta-item {
    background: #0a0a0a;
    border: 1px solid #262626;
    border-radius: 12px;
    padding: 12px 14px;
    min-width: 0;
  }
  .meta-label {
    color: #a1a1aa;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .meta-value { color: #ffffff; font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
  .messages { display: flex; flex-direction: column; gap: 12px; }
  .msg {
    max-width: 78%;
    border-radius: 16px;
    padding: 12px 16px;
    font-size: 14px;
    line-height: 1.6;
    overflow-wrap: anywhere;
  }
  .msg-client { align-self: flex-start; background: #262626; color: #f4f4f5; border-bottom-left-radius: 6px; }
  .msg-agent { align-self: flex-end; background: #dd0005; color: #ffffff; border-bottom-right-radius: 6px; }
  .msg-system {
    align-self: center;
    background: #171717;
    border: 1px solid #262626;
    color: #a1a1aa;
    font-size: 12px;
    text-align: center;
  }
  .msg-time { margin-top: 6px; font-size: 10px; opacity: 0.65; }
  .msg-agent .msg-time { text-align: right; }
  .empty { color: #a1a1aa; font-size: 14px; text-align: center; padding: 32px 0; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <p class="logo">S T R I K E</p>
      <div class="meta">${metaHtml}
      </div>
    </header>
    <main class="messages">
${messagesHtml}
    </main>
  </div>
</body>
</html>`;
}

function renderMessage(message: ChatMessage): string {
  const kind = message.role === "assistant" ? "msg-agent" : message.role === "system" ? "msg-system" : "msg-client";
  const content = escapeHtml(message.content).replace(/\n/g, "<br>");
  return `      <article class="msg ${kind}">
        <div>${content}</div>
        <div class="msg-time">${escapeHtml(formatDateTime(message.createdAt))}</div>
      </article>`;
}

function formatDuration(firstAt: string | null, lastAt: string | null): string {
  if (!firstAt || !lastAt) return "—";
  const diffMs = new Date(lastAt).getTime() - new Date(firstAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "—";
  const totalSeconds = Math.round(diffMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds} сек`;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days} д ${hours} ч ${minutes} мин`;
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
