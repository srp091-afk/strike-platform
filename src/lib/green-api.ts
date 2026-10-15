import "server-only";

const API_URL = "https://api.green-api.com";

export type GreenCredentials = {
  idInstance: string;
  apiToken: string;
};

export function readOptionalGreenCredentials(): { instanceId: string; apiToken: string } {
  const instanceId = process.env.GREEN_API_ID_INSTANCE?.trim() ?? "";
  const apiToken = process.env.GREEN_API_TOKEN_INSTANCE?.trim() ?? "";
  if (!/^\d{4,}$/.test(instanceId) || apiToken.length < 8) return { instanceId: "", apiToken: "" };
  return { instanceId, apiToken };
}

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
  const prefix = idInstance.substring(0, 4);
  const host = /^\d{4}$/.test(prefix) ? `https://${prefix}.api.green-api.com` : API_URL;
  return `${host}/waInstance${idInstance}/${method}/${apiToken}`;
}

function phoneDigits(value: string) {
  const local = value.trim().replace(/@c\.us$/i, "").split("@")[0] ?? "";
  return local.replace(/\D/g, "");
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

export async function ensureGreenIncomingWebhook(credentials: GreenCredentials) {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://strike-platform.vercel.app").replace(/\/$/, "");
  const response = await fetch(endpoint("setSettings", credentials), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl: `${origin}/api/webhooks/whatsapp`,
      incomingWebhook: "yes",
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`Green API setSettings ${response.status}`);
  }
}

const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

export async function downloadGreenFile(
  input: { chatId: string; messageId: string; downloadUrl?: string },
  credentials: GreenCredentials,
) {
  const url = await resolveGreenDownloadUrl(input, credentials);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Green API file ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error("Green API вернул пустой файл.");
  if (bytes.length > MAX_MEDIA_BYTES) throw new Error("Файл слишком большой.");
  const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  return { bytes, mimeType };
}

async function resolveGreenDownloadUrl(
  input: { chatId: string; messageId: string; downloadUrl?: string },
  credentials: GreenCredentials,
) {
  try {
    const response = await fetch(endpoint("downloadFile", credentials), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: input.chatId, idMessage: input.messageId }),
      signal: AbortSignal.timeout(20000),
    });
    const payload = (await response.json().catch(() => null)) as { downloadUrl?: string; url?: string } | null;
    const fromApi = payload?.downloadUrl || payload?.url || "";
    if (response.ok && fromApi) return fromApi;
    console.error("[green-api] downloadFile", response.status);
  } catch (error) {
    console.error("[green-api] downloadFile", error instanceof Error ? error.message : error);
  }
  if (input.downloadUrl) return input.downloadUrl;
  throw new Error("Green API не вернул ссылку на файл.");
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

export function greenInstanceAlreadyLogged(type: string, message: string) {
  const haystack = `${type} ${message}`.toLowerCase();
  return type === "alreadyLogged" || haystack.includes("already logged") || haystack.includes("already authorized");
}

export async function getGreenQr(credentials?: GreenCredentials) {
  const response = await fetch(endpoint("qr", credentials), {
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { type?: string; message?: string } | null;
  const type = payload?.type ?? "error";
  let message = typeof payload?.message === "string" ? payload.message : "";
  if (greenInstanceAlreadyLogged(type, message)) {
    return { type: "alreadyLogged", message };
  }
  if (!response.ok) {
    throw new Error(`Green API qr ${response.status}`);
  }

  if (type === "qrCode" && message && !message.startsWith("data:image/")) {
    message = `data:image/png;base64,${message}`;
  }
  return { type, message };
}

export async function getGreenPhone(credentials: GreenCredentials) {
  const response = await fetch(endpoint("getSettings", credentials), {
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { wid?: string; phone?: string | number } | null;
  if (!response.ok) {
    throw new Error(`Green API getSettings ${response.status}`);
  }

  const fromWid = typeof payload?.wid === "string" ? phoneDigits(payload.wid) : "";
  if (fromWid) return fromWid;
  if (typeof payload?.phone === "number" && Number.isFinite(payload.phone)) return phoneDigits(String(payload.phone));
  if (typeof payload?.phone === "string") return phoneDigits(payload.phone);
  return "";
}

export async function getGreenAuthorizationCode(credentials: GreenCredentials, phoneNumber: string) {
  const response = await fetch(endpoint("getAuthorizationCode", credentials), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: Number(phoneNumber) }),
    signal: AbortSignal.timeout(20000),
  });
  const payload = (await response.json().catch(() => null)) as { code?: string } | null;
  if (!response.ok || typeof payload?.code !== "string" || !payload.code.trim()) {
    throw new Error("Не удалось получить код связывания.");
  }
  return payload.code.trim();
}

export async function getGreenState(credentials?: GreenCredentials) {
  const response = await fetch(endpoint("getStateInstance", credentials), {
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => null)) as { stateInstance?: string } | null;
  if (!response.ok) {
    throw new Error(`Green API getStateInstance ${response.status}`);
  }

  return payload?.stateInstance ?? "unknown";
}
