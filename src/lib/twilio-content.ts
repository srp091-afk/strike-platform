import "server-only";

const CONTENT_URL = "https://content.twilio.com/v1/Content";

export type TemplateStatus = "pending" | "approved" | "rejected";

export type TwilioAuth = {
  accountSid: string;
  authToken: string;
  whatsappNumber: string;
};

type TwilioErrorBody = { message?: unknown; code?: unknown };

export function authorization(auth: Pick<TwilioAuth, "accountSid" | "authToken">) {
  return `Basic ${Buffer.from(`${auth.accountSid}:${auth.authToken}`).toString("base64")}`;
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

/** Проверка SID и токена запросом сведений об аккаунте. Секреты в ответе Twilio нет. */
export async function verifyTwilioAccount(auth: Pick<TwilioAuth, "accountSid" | "authToken">) {
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(auth.accountSid)}.json`, {
    headers: { Authorization: authorization(auth) },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) {
    return { error: "Account SID или Auth Token неверны." } as const;
  }
  if (!response.ok) return { error: await readError(response) } as const;
  return { ok: true } as const;
}

export async function createTextContent(
  auth: TwilioAuth,
  input: { name: string; language: string; body: string; variables: Record<string, string> },
) {
  const response = await fetch(CONTENT_URL, {
    method: "POST",
    headers: { Authorization: authorization(auth), "Content-Type": "application/json" },
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
export async function submitWhatsAppApproval(auth: TwilioAuth, sid: string, name: string) {
  const response = await fetch(`${CONTENT_URL}/${encodeURIComponent(sid)}/ApprovalRequests/whatsapp`, {
    method: "POST",
    headers: { Authorization: authorization(auth), "Content-Type": "application/json" },
    body: JSON.stringify({ name, category: "UTILITY" }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return { error: await readError(response) } as const;
  return { ok: true } as const;
}

export async function deleteContent(auth: TwilioAuth, sid: string) {
  await fetch(`${CONTENT_URL}/${encodeURIComponent(sid)}`, {
    method: "DELETE",
    headers: { Authorization: authorization(auth) },
    signal: AbortSignal.timeout(20_000),
  }).catch(() => undefined);
}

/** Ответ внутри 24-часового окна: обычный текст, без шаблона. */
export async function sendTextMessage(auth: TwilioAuth, input: { phoneDigits: string; body: string }) {
  const form = new URLSearchParams({
    To: `whatsapp:+${input.phoneDigits}`,
    From: `whatsapp:${auth.whatsappNumber}`,
    Body: input.body.slice(0, 1600),
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${auth.accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: authorization(auth), "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return { error: await readError(response) } as const;
  return { ok: true } as const;
}

/** Первое сообщение лиду по одобренному шаблону WhatsApp. */
export async function sendTemplateMessage(
  auth: TwilioAuth,
  input: { phoneDigits: string; contentSid: string; variables: Record<string, string> },
) {
  const form = new URLSearchParams({
    To: `whatsapp:+${input.phoneDigits}`,
    From: `whatsapp:${auth.whatsappNumber}`,
    ContentSid: input.contentSid,
    ContentVariables: JSON.stringify(input.variables),
  });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${auth.accountSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: authorization(auth), "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) return { error: await readError(response) } as const;
  return { ok: true } as const;
}

export async function fetchApprovalStatus(auth: TwilioAuth, sid: string) {
  const response = await fetch(`${CONTENT_URL}/${encodeURIComponent(sid)}/ApprovalRequests`, {
    headers: { Authorization: authorization(auth) },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) return { error: await readError(response) } as const;
  return { status: readTemplateStatus(await response.json()) } as const;
}
