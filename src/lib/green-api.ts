import "server-only";

const API_URL = "https://7103.api.greenapi.com";

export type GreenCredentials = {
  idInstance: string;
  apiToken: string;
};

export function greenApiCredentials(): GreenCredentials {
  const idInstance = process.env.GREEN_API_ID_INSTANCE?.trim() ?? "";
  const apiToken = process.env.GREEN_API_TOKEN_INSTANCE?.trim() ?? "";
  if (!idInstance || !apiToken) {
    throw new Error("Green API не настроен.");
  }
  return { idInstance, apiToken };
}

function endpoint(method: string, credentials?: GreenCredentials) {
  const { idInstance, apiToken } = credentials ?? greenApiCredentials();
  const prefix = idInstance.slice(0, 4);
  const host = /^\d{4}$/.test(prefix) ? `https://${prefix}.api.greenapi.com` : API_URL;
  return `${host}/waInstance${idInstance}/${method}/${apiToken}`;
}

export async function getGreenChatHistory(chatId: string, count = 10, credentials?: GreenCredentials) {
  const response = await fetch(endpoint("getChatHistory", credentials), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, count }),
    signal: AbortSignal.timeout(15000),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Green API getChatHistory ${response.status}`);
  }

  return Array.isArray(payload) ? payload : [];
}

export async function sendGreenMessage(chatId: string, message: string, credentials?: GreenCredentials) {
  const response = await fetch(endpoint("sendMessage", credentials), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message }),
    signal: AbortSignal.timeout(15000),
  });

  const payload = (await response.json().catch(() => null)) as { idMessage?: string } | null;
  if (!response.ok) {
    throw new Error(`Green API sendMessage ${response.status}`);
  }

  return typeof payload?.idMessage === "string" ? payload.idMessage : null;
}

export async function getGreenQr() {
  const response = await fetch(endpoint("qr"), {
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { type?: string; message?: string } | null;
  if (!response.ok) {
    throw new Error(`Green API qr ${response.status}`);
  }

  const type = payload?.type ?? "error";
  let message = typeof payload?.message === "string" ? payload.message : "";
  if (type === "qrCode" && message && !message.startsWith("data:image/")) {
    message = `data:image/png;base64,${message}`;
  }
  return { type, message };
}

export async function getGreenState() {
  const response = await fetch(endpoint("getStateInstance"), {
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { stateInstance?: string } | null;
  if (!response.ok) {
    throw new Error(`Green API getStateInstance ${response.status}`);
  }

  return payload?.stateInstance ?? "unknown";
}
