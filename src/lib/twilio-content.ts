import "server-only";

const CONTENT_URL = "https://content.twilio.com/v1/Content";

export type TemplateStatus = "pending" | "approved" | "rejected";

type TwilioErrorBody = { message?: unknown; code?: unknown };

function credentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim() ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  if (!accountSid || !authToken) return null;
  return { accountSid, authToken };
}

function authorization() {
  const keys = credentials();
  if (!keys) return null;
  return `Basic ${Buffer.from(`${keys.accountSid}:${keys.authToken}`).toString("base64")}`;
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => null)) as TwilioErrorBody | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  return message || `Twilio ответил ${response.status}.`;
}

/** Плейсхолдеры {{1}}, {{2}} и примеры для модерации WhatsApp. */
export function templateVariables(body: string) {
  const numbers = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => Number(match[1]));
  const unique = [...new Set(numbers)].sort((left, right) => left - right);
  if (unique.some((value, index) => value !== index + 1)) {
    return { error: "Переменные в тексте должны идти по порядку: {{1}}, {{2}} и далее." } as const;
  }
  const variables: Record<string, string> = {};
  for (const value of unique) variables[String(value)] = "пример";
  return { variables } as const;
}

export function readTemplateStatus(payload: unknown): TemplateStatus {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const whatsapp = root.whatsapp && typeof root.whatsapp === "object" ? (root.whatsapp as Record<string, unknown>) : {};
  const status = typeof whatsapp.status === "string" ? whatsapp.status.trim().toLowerCase() : "";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return "pending";
}

export async function createTextContent(input: { name: string; language: string; body: string; variables: Record<string, string> }) {
  const header = authorization();
  if (!header) return { error: "Задайте TWILIO_ACCOUNT_SID и TWILIO_AUTH_TOKEN." } as const;

  const response = await fetch(CONTENT_URL, {
    method: "POST",
    headers: { Authorization: header, "Content-Type": "application/json" },
    body: JSON.stringify({
      friendly_name: input.name,
      language: input.language,
      ...(Object.keys(input.variables).length > 0 ? { variables: input.variables } : {}),
      types: { "twilio/text": { body: input.body } },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return { error: await readError(response) } as const;

  const payload = (await response.json()) as { sid?: unknown };
  const sid = typeof payload.sid === "string" ? payload.sid.trim() : "";
  if (!sid) return { error: "Twilio не вернул Sid шаблона." } as const;
  return { sid } as const;
}

/** Отправка на модерацию WhatsApp. Категория фиксирована: UTILITY. */
export async function submitWhatsAppApproval(sid: string, name: string) {
  const header = authorization();
  if (!header) return { error: "Задайте TWILIO_ACCOUNT_SID и TWILIO_AUTH_TOKEN." } as const;

  const response = await fetch(`${CONTENT_URL}/${encodeURIComponent(sid)}/ApprovalRequests/whatsapp`, {
    method: "POST",
    headers: { Authorization: header, "Content-Type": "application/json" },
    body: JSON.stringify({ name, category: "UTILITY" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return { error: await readError(response) } as const;
  return { ok: true } as const;
}

export async function deleteContent(sid: string) {
  const header = authorization();
  if (!header) return;
  await fetch(`${CONTENT_URL}/${encodeURIComponent(sid)}`, {
    method: "DELETE",
    headers: { Authorization: header },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => undefined);
}

/** Первое сообщение лиду по одобренному шаблону WhatsApp. */
export async function sendTemplateMessage(input: { phoneDigits: string; contentSid: string; variables: Record<string, string> }) {
  const keys = credentials();
  const header = authorization();
  const sender = process.env.TWILIO_PHONE_NUMBER?.trim() ?? "";
  if (!keys || !header) return { error: "Задайте TWILIO_ACCOUNT_SID и TWILIO_AUTH_TOKEN." } as const;
  if (!sender) return { error: "Задайте TWILIO_PHONE_NUMBER." } as const;

  const form = new URLSearchParams({
    To: `whatsapp:+${input.phoneDigits}`,
    From: `whatsapp:${sender}`,
    ContentSid: input.contentSid,
    ContentVariables: JSON.stringify(input.variables),
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${keys.accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: header, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return { error: await readError(response) } as const;
  return { ok: true } as const;
}

export async function fetchApprovalStatus(sid: string) {
  const header = authorization();
  if (!header) return { error: "Задайте TWILIO_ACCOUNT_SID и TWILIO_AUTH_TOKEN." } as const;

  const response = await fetch(`${CONTENT_URL}/${encodeURIComponent(sid)}/ApprovalRequests`, {
    headers: { Authorization: header },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) return { error: await readError(response) } as const;
  return { status: readTemplateStatus(await response.json()) } as const;
}
