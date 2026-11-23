import "server-only";

import { sendGreenMessage } from "@/lib/green-api";

/** Маркер в wa_api_token: ключ сервера Evolution в браузер и в БД не кладём. */
export const EVOLUTION_TOKEN = "evolution";

export function evolutionConfigured() {
  const url = process.env.EVOLUTION_API_URL?.trim() ?? "";
  const key = process.env.EVOLUTION_API_KEY?.trim() ?? "";
  return Boolean(url && key);
}

export function evolutionInstanceName(agentId: string) {
  return `strike_${agentId.slice(0, 8).toLowerCase()}`;
}

export function isEvolutionInstance(instanceId: string) {
  return /^strike_[0-9a-f]{8}$/i.test(instanceId.trim());
}

export function evolutionWebhookUrl() {
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://www.strikeplatform.io").replace(/\/$/, "");
  return `${origin}/api/webhooks/whatsapp/evolution`;
}

function evolutionConfig() {
  const url = (process.env.EVOLUTION_API_URL?.trim() ?? "").replace(/\/$/, "");
  const key = process.env.EVOLUTION_API_KEY?.trim() ?? "";
  if (!url || !key) throw new Error("Evolution API не настроен.");
  return { url, key };
}

async function evolutionFetch(path: string, init?: RequestInit) {
  const { url, key } = evolutionConfig();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
    signal: init?.signal ?? AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function errorText(payload: unknown) {
  const record = asRecord(payload);
  const response = asRecord(record.response);
  const message = record.message ?? response.message ?? record.error;
  if (Array.isArray(message)) return message.map((item) => stringValue(item)).filter(Boolean).join(" ");
  return stringValue(message);
}

function alreadyExists(status: number, payload: unknown) {
  if (status === 409) return true;
  return /already/i.test(errorText(payload));
}

export async function createInstance(instanceName: string, webhookUrl: string, options?: { qrcode?: boolean }) {
  const { response, payload } = await evolutionFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName,
      integration: "WHATSAPP-BAILEYS",
      qrcode: options?.qrcode !== false,
      webhook: {
        url: webhookUrl,
        byEvents: false,
        base64: false,
        events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE"],
      },
    }),
  });
  if (!response.ok && !alreadyExists(response.status, payload)) {
    throw new Error(errorText(payload) || `Evolution API create ${response.status}`);
  }
  return payload;
}

export function readEvolutionQr(payload: unknown) {
  const root = asRecord(payload);
  const qrcode = asRecord(root.qrcode);
  const raw = stringValue(root.base64) || stringValue(qrcode.base64) || stringValue(asRecord(root.qr).base64);
  if (!raw) return "";
  if (raw.startsWith("data:image/")) return raw;
  return `data:image/png;base64,${raw}`;
}

export function readEvolutionPairingCode(payload: unknown) {
  const root = asRecord(payload);
  const qrcode = asRecord(root.qrcode);
  return (stringValue(root.pairingCode) || stringValue(root.pairing_code) || stringValue(qrcode.pairingCode)).replace(/\s/g, "");
}

export function readEvolutionState(payload: unknown) {
  const root = asRecord(payload);
  const instance = asRecord(root.instance);
  return (
    stringValue(instance.state) ||
    stringValue(root.state) ||
    stringValue(instance.connectionStatus) ||
    stringValue(root.connectionStatus) ||
    stringValue(instance.status)
  ).toLowerCase();
}

export async function getQrCode(instanceName: string) {
  const { response, payload } = await evolutionFetch(`/instance/connect/${encodeURIComponent(instanceName)}`);
  if (!response.ok) throw new Error(errorText(payload) || `Evolution API connect ${response.status}`);
  return {
    base64: readEvolutionQr(payload),
    pairingCode: readEvolutionPairingCode(payload),
    state: readEvolutionState(payload),
    payload,
  };
}

async function connectForPairing(instanceName: string, digits: string) {
  const { response, payload } = await evolutionFetch(
    `/instance/connect/${encodeURIComponent(instanceName)}?number=${encodeURIComponent(digits)}`,
  );
  if (!response.ok) throw new Error(errorText(payload) || `Evolution API pairing ${response.status}`);
  return readEvolutionPairingCode(payload);
}

/** Удаляет инстанс перед новым QR или кодом. 404 — инстанса ещё не было. */
export async function deleteEvolutionInstance(instanceName: string) {
  const removed = await evolutionFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
  if (removed.response.ok || removed.response.status === 404) return;
  // Пока сессия в connecting, delete часто отвечает 400, пока не сделать logout.
  await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" }).catch(() => null);
  const retry = await evolutionFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
  if (!retry.response.ok && retry.response.status !== 404) {
    throw new Error(errorText(retry.payload) || `Evolution API delete ${retry.response.status}`);
  }
}

export async function getPairingCode(instanceName: string, phoneNumber: string) {
  const digits = phoneNumber.replace(/\D/g, "");
  const state = await getConnectionState(instanceName).catch(() => "close");
  if (state === "open") {
    const error = new Error("WhatsApp уже подключён.");
    error.name = "EvolutionAlreadyOpen";
    throw error;
  }
  const code = await connectForPairing(instanceName, digits);
  if (!code) throw new Error("Не удалось получить код связывания.");
  return code;
}

export async function getConnectionState(instanceName: string) {
  const { response, payload } = await evolutionFetch(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
  if (response.status === 404) return "close";
  if (!response.ok) throw new Error(errorText(payload) || `Evolution API state ${response.status}`);
  return readEvolutionState(payload) || "close";
}

/** Скачивает входящее медиа. Сначала по key, затем целиком событие — Baileys ищет url внутри message. */
export async function downloadEvolutionMedia(
  instanceName: string,
  key: Record<string, unknown>,
  message?: unknown,
) {
  const attempts: unknown[] = [{ message: { key }, convertToMp4: false }];
  if (message) attempts.push({ message, convertToMp4: false });

  let lastError = "Evolution API не отдал файл.";
  for (const body of attempts) {
    const { response, payload } = await evolutionFetch(
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) {
      lastError = errorText(payload) || `Evolution API media ${response.status}`;
      continue;
    }
    const base64 = readMediaBase64(payload);
    if (!base64) {
      lastError = "Evolution API вернул пустой файл.";
      continue;
    }
    const root = asRecord(payload);
    return {
      base64,
      mimeType: stringValue(root.mimetype) || stringValue(root.mimeType),
      fileName: stringValue(root.fileName),
    };
  }
  throw new Error(lastError);
}

function readMediaBase64(payload: unknown) {
  const root = asRecord(payload);
  const nested = asRecord(root.media);
  const data = asRecord(root.data);
  const raw = stringValue(root.base64) || stringValue(nested.base64) || stringValue(data.base64);
  const cleaned = raw.replace(/^data:[^;]+;base64,/i, "").replace(/\s/g, "");
  return cleaned.length >= 32 ? cleaned : "";
}

export async function sendTextMessage(instanceName: string, phone: string, text: string) {
  const number = phone.replace(/@.*/, "").replace(/\D/g, "");
  const { response, payload } = await evolutionFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number, text }),
  });
  if (!response.ok) throw new Error(`Evolution API sendText ${response.status}`);
  return readOutboundMessageId(payload);
}

function readOutboundMessageId(payload: unknown) {
  const root = asRecord(payload);
  const key = asRecord(root.key);
  const data = asRecord(root.data);
  const dataKey = asRecord(data.key);
  return stringValue(key.id) || stringValue(dataKey.id) || stringValue(root.messageId) || null;
}

export async function logoutAndDeleteInstance(instanceName: string) {
  await evolutionFetch(`/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" }).catch(() => null);
  const { response, payload } = await evolutionFetch(`/instance/delete/${encodeURIComponent(instanceName)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(errorText(payload) || `Evolution API delete ${response.status}`);
  }
}

export async function getInstancePhone(instanceName: string) {
  const { response, payload } = await evolutionFetch("/instance/fetchInstances");
  if (!response.ok) return "";
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(asRecord(payload).value)
      ? (asRecord(payload).value as unknown[])
      : Array.isArray(asRecord(payload).instances)
        ? (asRecord(payload).instances as unknown[])
        : [payload];
  const wanted = instanceName.toLowerCase();
  for (const item of list) {
    const row = asRecord(item);
    const instance = asRecord(row.instance);
    const name = stringValue(instance.instanceName) || stringValue(row.name) || stringValue(row.instanceName);
    if (name.toLowerCase() !== wanted) continue;
    const owner =
      stringValue(instance.owner) ||
      stringValue(row.ownerJid) ||
      stringValue(row.owner) ||
      stringValue(instance.wuid) ||
      stringValue(row.wuid) ||
      stringValue(row.number);
    const digits = owner.replace(/\D/g, "");
    if (digits) return digits;
  }
  return "";
}

/** Исходящие WhatsApp: инстанс Evolution или прежние ключи Green API. Twilio сюда не входит. */
export async function sendConnectedWhatsApp(instanceId: string, apiToken: string, chatId: string, text: string) {
  if (isEvolutionInstance(instanceId)) return sendTextMessage(instanceId, chatId, text);
  return sendGreenMessage(chatId, text, { idInstance: instanceId, apiToken });
}
