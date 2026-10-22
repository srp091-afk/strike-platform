import "server-only";

import { sendGreenMessage } from "@/lib/green-api";
import { markdownToTelegramHtml } from "@/lib/telegram-format";

type Credentials = Record<string, string>;

type DeliveryInput = {
  provider: string;
  externalChatId: string;
  text: string;
  credentials: Credentials | null;
};

export type DeliveryResult = {
  delivered: boolean;
  detail: string;
};

export async function deliverChunk(input: DeliveryInput): Promise<DeliveryResult> {
  const credentials = input.credentials ?? {};

  if (input.provider === "telegram") {
    return sendTelegram(credentials.botToken, input.externalChatId, input.text);
  }

  if (input.provider === "whatsapp") {
    return sendWhatsApp(credentials, input.externalChatId, input.text);
  }

  if (input.provider === "instagram") {
    return sendInstagram(credentials, input.externalChatId, input.text);
  }

  return { delivered: false, detail: "unknown_provider" };
}

async function sendTelegram(botToken: string | undefined, chatId: string, text: string) {
  if (!botToken) {
    return { delivered: false, detail: "missing_bot_token" };
  }

  let response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: markdownToTelegramHtml(text), parse_mode: "HTML" }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    // Fallback без разметки, если Telegram отклонил HTML.
    response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(15000),
    });
  }

  if (!response.ok) {
    return { delivered: false, detail: `telegram_${response.status}` };
  }

  return { delivered: true, detail: "telegram" };
}

async function sendWhatsApp(_credentials: Credentials, chatId: string, text: string) {
  try {
    await sendGreenMessage(chatId, text);
    return { delivered: true, detail: "whatsapp" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("не настроен")) {
      return { delivered: false, detail: "missing_greenapi_credentials" };
    }
    const status = message.match(/(\d{3})$/)?.[1];
    return { delivered: false, detail: status ? `whatsapp_${status}` : "delivery_error" };
  }
}

async function sendInstagram(credentials: Credentials, recipientId: string, text: string) {
  const pageId = credentials.pageId;
  const accessToken = credentials.accessToken;
  if (!pageId || !accessToken) {
    return { delivered: false, detail: "missing_instagram_credentials" };
  }

  const response = await fetch(`https://graph.facebook.com/v21.0/${pageId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    return { delivered: false, detail: `instagram_${response.status}` };
  }

  return { delivered: true, detail: "instagram" };
}
