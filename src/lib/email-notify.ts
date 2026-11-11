import "server-only";

import { Resend } from "resend";

export type LeadEmailPayload = {
  to: string;
  agentName: string;
  reason: string;
  channel: string;
  clientName: string | null;
  contact: string;
  contactUrl: string | null;
  fields: Record<string, string>;
  paused: boolean;
  history: { role: "user" | "assistant"; content: string }[];
};

/**
 * Письмо о лиде. Никогда не бросает: нет ключа, Resend отклонил адрес или сеть
 * оборвалась — возвращаем { ok: false }, чтобы ответ клиенту в чате не падал.
 */
export async function sendLeadEmail(payload: LeadEmailPayload) {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const to = payload.to.trim();
  if (!apiKey || !to) {
    const error = apiKey ? "У агента не указан email для уведомлений." : "RESEND_API_KEY не задан.";
    console.warn("[email-notify]", error);
    return { ok: false as const, error };
  }

  const from = process.env.RESEND_FROM_EMAIL?.trim() || "STRIKE <onboarding@resend.dev>";

  try {
    const resend = new Resend(apiKey);
    const subject = `Новый лид — ${payload.agentName}`.slice(0, 180);
    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html: renderHtml(payload),
      text: renderText(payload),
    });
    if (error) {
      console.error("[email-notify]", error.message);
      return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось отправить письмо о лиде.";
    console.error("[email-notify]", message);
    return { ok: false as const, error: message };
  }
}

function renderText(payload: LeadEmailPayload) {
  const lines = [
    "Новый лид",
    `Агент: ${payload.agentName}`,
    `Причина: ${payload.reason}`,
    `Канал: ${payload.channel}`,
  ];
  if (payload.clientName) lines.push(`Клиент: ${payload.clientName}`);
  lines.push(`Контакт: ${payload.contact}${payload.contactUrl ? ` (${payload.contactUrl})` : ""}`);
  const entries = Object.entries(payload.fields);
  if (entries.length > 0) {
    lines.push("", "Данные");
    for (const [key, value] of entries) lines.push(`- ${key}: ${value}`);
  }
  if (payload.history.length > 0) {
    lines.push("", "Диалог");
    for (const item of payload.history) {
      lines.push(`${item.role === "user" ? "Клиент" : "Агент"}: ${item.content}`);
    }
  }
  if (payload.paused) lines.push("", "Бот в этом чате остановлен.");
  return lines.join("\n");
}

function renderHtml(payload: LeadEmailPayload) {
  const contact = payload.contactUrl
    ? `<a href="${escapeAttr(payload.contactUrl)}" style="color:#b91c1c;text-decoration:none;">${escapeHtml(payload.contact)}</a>`
    : escapeHtml(payload.contact);
  const rows = [
    row("Агент", escapeHtml(payload.agentName)),
    row("Причина", escapeHtml(payload.reason)),
    row("Канал", escapeHtml(payload.channel)),
    payload.clientName ? row("Клиент", escapeHtml(payload.clientName)) : "",
    row("Контакт", contact),
  ];
  const fields = Object.entries(payload.fields)
    .map(([key, value]) => row(key, escapeHtml(value)))
    .join("");
  const history = payload.history
    .map(
      (item) =>
        `<tr><td style="padding:8px 0;border-top:1px solid #e4e4e7;font-size:13px;line-height:1.5;color:#3f3f46;"><strong style="color:#18181b;">${item.role === "user" ? "Клиент" : "Агент"}.</strong> ${escapeHtml(item.content)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;">
      <tr><td style="padding:24px 24px 8px;font-size:20px;font-weight:700;">Новый лид</td></tr>
      <tr><td style="padding:0 24px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table></td></tr>
      ${fields ? `<tr><td style="padding:8px 24px 0;font-size:13px;font-weight:700;">Данные</td></tr><tr><td style="padding:0 24px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${fields}</table></td></tr>` : ""}
      ${history ? `<tr><td style="padding:12px 24px 0;font-size:13px;font-weight:700;">Диалог</td></tr><tr><td style="padding:0 24px 8px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${history}</table></td></tr>` : ""}
      ${payload.paused ? `<tr><td style="padding:8px 24px 0;font-size:13px;color:#71717a;">Бот в этом чате остановлен.</td></tr>` : ""}
      <tr><td style="padding:16px 24px 24px;font-size:12px;color:#a1a1aa;">STRIKE</td></tr>
    </table>
  </body>
</html>`;
}

function row(label: string, valueHtml: string) {
  return `<tr><td style="padding:6px 12px 6px 0;font-size:13px;color:#71717a;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;line-height:1.45;color:#18181b;">${valueHtml}</td></tr>`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeAttr(value: string) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
