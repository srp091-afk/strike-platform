import "server-only";

const TIMEOUT_MS = 7000;

export type TwilioSmsSendResult = { ok: true; sid: string } | { ok: false; error: string };

export type TwilioSmsTestResult = { ok: true; friendlyName?: string } | { ok: false; error: string };

/** Пустая строка — поле не заполнено. null — значение не проходит проверку. */
export function readTwilioAccountSid(value: string) {
  const sid = value.trim();
  if (!sid) return "";
  return /^AC[0-9a-fA-F]{32}$/.test(sid) ? sid : null;
}

/** Пустая строка — токен не менять. null — токен с пробелами или слишком короткий. */
export function readTwilioAuthToken(value: string) {
  if (!value.trim()) return "";
  if (/\s/.test(value) || value.trim().length < 16 || value.trim().length > 128) return null;
  return value.trim();
}

/** Пустая строка — номера нет. null — не E.164. Пробелы и скобки снимаются. */
export function readTwilioSmsNumber(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (!compact) return "";
  return /^\+\d{10,15}$/.test(compact) ? compact : null;
}

export async function sendTwilioSms(input: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}): Promise<TwilioSmsSendResult> {
  const accountSid = input.accountSid.trim();
  const authToken = input.authToken.trim();
  const from = input.from.trim();
  const to = input.to.trim();
  const body = input.body.trim();
  if (!accountSid || !authToken || !from || !to || !body) {
    return { ok: false, error: "Не хватает данных Twilio для отправки SMS." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: basicAuth(accountSid, authToken),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ From: from, To: to, Body: body }),
        signal: controller.signal,
      },
    );
    const payload = (await response.json().catch(() => null)) as { sid?: unknown; message?: unknown } | null;
    const sid = typeof payload?.sid === "string" ? payload.sid : "";
    if (!response.ok || !sid) {
      const message = typeof payload?.message === "string" && payload.message.trim() ? payload.message.trim() : "";
      return { ok: false, error: message || `Twilio ответил ${response.status}.` };
    }
    return { ok: true, sid };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Twilio не ответил за 7 секунд." };
    }
    return { ok: false, error: "Не удалось отправить SMS." };
  } finally {
    clearTimeout(timer);
  }
}

export async function testTwilioSmsConnection(input: {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}): Promise<TwilioSmsTestResult> {
  const accountSid = readTwilioAccountSid(input.accountSid);
  const authToken = readTwilioAuthToken(input.authToken);
  const phoneNumber = readTwilioSmsNumber(input.phoneNumber);
  if (accountSid === null || !accountSid) {
    return { ok: false, error: "Account SID должен начинаться с AC и содержать 34 символа." };
  }
  if (authToken === null || !authToken) {
    return { ok: false, error: "Auth Token пустой или содержит пробелы." };
  }
  if (phoneNumber === null || !phoneNumber) {
    return { ok: false, error: "Номер Twilio должен быть в формате + и от 10 до 15 цифр." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}.json`, {
      headers: { Authorization: basicAuth(accountSid, authToken) },
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as { friendly_name?: unknown; message?: unknown } | null;
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "Неверный Account SID или Auth Token." };
    }
    if (!response.ok) {
      const message = typeof payload?.message === "string" && payload.message.trim() ? payload.message.trim() : "";
      return { ok: false, error: message || `Twilio ответил ${response.status}.` };
    }
    const friendlyName = typeof payload?.friendly_name === "string" ? payload.friendly_name.trim() : "";
    return friendlyName ? { ok: true, friendlyName } : { ok: true };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: "Twilio не ответил за 7 секунд." };
    }
    return { ok: false, error: "Не удалось проверить подключение Twilio." };
  } finally {
    clearTimeout(timer);
  }
}

function basicAuth(accountSid: string, authToken: string) {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}
