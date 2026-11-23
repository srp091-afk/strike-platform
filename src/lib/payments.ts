import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { noteAmoPayment } from "@/lib/amocrm";
import { noteBitrixPayment } from "@/lib/bitrix24";
import { sendConnectedWhatsApp } from "@/lib/evolution-api";
import { notePipedrivePayment } from "@/lib/pipedrive";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { sendTextMessage } from "@/lib/twilio-content";
import { twilioAccountForUser } from "@/lib/twilio-account";
import { dispatchAgentWebhook, loadAgentWebhook } from "@/lib/webhooks";

const TIMEOUT_MS = 7000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_RETURN = "https://www.strikeplatform.io";
const STRIPE_CURRENCIES = new Set(["usd", "eur", "gbp", "gel"]);

export type PaymentProvider = "stripe" | "yookassa" | "prodamus";

type PaymentAgent = {
  id: string;
  userId: string;
  stripeSecret: string;
  stripeWebhookSecret: string;
  stripeCurrency: string;
  yookassaShopId: string;
  yookassaSecret: string;
  prodamusShopUrl: string;
  prodamusSecret: string;
  successMessage: string;
  returnUrl: string;
  waInstanceId: string;
  waApiToken: string;
  telegramBotToken: string;
  instagramPageId: string;
  instagramAccessToken: string;
};

type PaymentRow = {
  id: string;
  agent_id: string;
  channel: string;
  chat_id: string;
  provider: string;
  external_id: string | null;
  amount: number | string;
  currency: string;
  description: string;
  status: string;
};

export type PaymentDraft = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  returnUrl: string;
};

/** Пустая строка — поле очищено. null — адрес не платёжной страницы Продамус. */
export function readProdamusShopUrl(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const allowed = host === "payform.ru" || host === "prodamus.ru" || host.endsWith(".payform.ru") || host.endsWith(".prodamus.ru");
  if (!allowed) return null;
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "").slice(0, 300);
}

export function readStripeCurrency(value: string) {
  const currency = value.trim().toLowerCase();
  if (!currency) return "usd";
  return STRIPE_CURRENCIES.has(currency) ? currency : null;
}

export function readPaymentReturnUrl(value: string) {
  const raw = value.trim();
  if (!raw) return "";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  return url.toString().slice(0, 2000);
}

export function readPaymentSecret(value: string) {
  const secret = value.trim();
  if (!secret) return "";
  if (secret.length < 8 || secret.length > 500 || /\s/.test(secret)) return null;
  return secret;
}

export function paymentSystemRule(providers: PaymentProvider[]) {
  const names = providers.map(providerLabel).join(", ");
  return `У тебя подключён приём оплат. Бери цены СТРОГО из Базы Знаний или инструкций — никогда не придумывай цену сам. Когда клиент подтвердил покупку, вызови \`create_payment_link\` и отправь полученную ссылку прямо в чат. Доступные шлюзы: ${names}.`;
}

export async function loadPaymentProviders(agentId: string): Promise<PaymentProvider[]> {
  const agent = await loadPaymentAgent(agentId);
  return agent ? connectedProviders(agent) : [];
}

export async function testPaymentProvider(
  provider: PaymentProvider,
  creds: {
    stripeSecret?: string;
    yookassaShopId?: string;
    yookassaSecret?: string;
    prodamusShopUrl?: string;
    prodamusSecret?: string;
  },
): Promise<{ ok: true; accountId?: string } | { ok: false; error: string }> {
  if (provider === "stripe") return testStripe(creds.stripeSecret ?? "");
  if (provider === "yookassa") return testYookassa(creds.yookassaShopId ?? "", creds.yookassaSecret ?? "");
  return testProdamus(creds.prodamusShopUrl ?? "", creds.prodamusSecret ?? "");
}

export async function runPaymentTool(
  rawArgs: string,
  agentId: string,
  delivery: { channel: string; chatId: string },
) {
  const args = readArgs(rawArgs);
  if (!args) return JSON.stringify({ ok: false, error: "Аргументы функции не являются JSON." });
  const agent = await loadPaymentAgent(agentId);
  if (!agent) return JSON.stringify({ ok: false, error: "Приём оплат не подключён." });

  const connected = connectedProviders(agent);
  const requested = typeof args.provider === "string" ? args.provider.trim().toLowerCase() : "";
  if (requested && !isProvider(requested)) return JSON.stringify({ ok: false, error: "provider должен быть stripe, yookassa или prodamus." });
  const explicitCurrency = typeof args.currency === "string" && args.currency.trim() ? args.currency : "";
  const provider = chooseProvider(requested, connected, explicitCurrency.toLowerCase());
  if (!provider) {
    return JSON.stringify({
      ok: false,
      error: connected.length > 1 ? "Подключено несколько шлюзов: укажи provider и currency." : "Этот платёжный шлюз не подключён.",
    });
  }
  const currency = normalizeCurrency(explicitCurrency, provider, agent.stripeCurrency);
  if (!currency) return JSON.stringify({ ok: false, error: "Валюта должна быть кодом из трёх букв, например USD или RUB." });
  if (provider === "prodamus" && currency !== "rub") return JSON.stringify({ ok: false, error: "Продамус принимает оплату в RUB." });
  const amount = readAmount(args.amount);
  if (amount === null) return JSON.stringify({ ok: false, error: "Сумма должна быть числом больше нуля." });
  const description = typeof args.description === "string" ? args.description.trim().slice(0, 250) : "";
  if (description.length < 2) return JSON.stringify({ ok: false, error: "Нужно название товара или услуги." });

  const created = await createPaymentLink(agent, provider, {
    amount,
    currency,
    description,
    channel: delivery.channel,
    chatId: delivery.chatId,
  });
  return JSON.stringify(created);
}

export function verifyStripeSignature(rawBody: string, header: string | null, secret: string) {
  if (!header || !secret) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.trim().split("=", 2);
    if (key === "t" && value) timestamp = value;
    if (key === "v1" && value) signatures.push(value);
  }
  if (!/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected);
  return signatures.some((signature) => {
    const actual = Buffer.from(signature);
    return actual.length === expectedBuf.length && timingSafeEqual(actual, expectedBuf);
  });
}

export async function loadStripeWebhookSecret(agentId: string) {
  const agent = await loadPaymentAgent(agentId);
  return agent?.stripeWebhookSecret ?? "";
}

export async function confirmYookassaPayment(agentId: string, externalId: string) {
  const agent = await loadPaymentAgent(agentId);
  if (!agent?.yookassaShopId || !agent.yookassaSecret || !/^[\w-]{4,80}$/.test(externalId)) return null;
  const result = await yookassaRequest(agent.yookassaShopId, agent.yookassaSecret, `/payments/${encodeURIComponent(externalId)}`);
  if (!result.ok) return null;
  const record = asRecord(result.data);
  if (record.status !== "succeeded") return null;
  const metadata = asRecord(record.metadata);
  const paymentId = typeof metadata.payment_id === "string" ? metadata.payment_id : "";
  const amount = asRecord(record.amount);
  const value = typeof amount.value === "string" ? Number(amount.value) : Number(amount.value);
  return UUID_PATTERN.test(paymentId) ? { paymentId, amount: Number.isFinite(value) ? value : null } : null;
}

export function verifyProdamusSignature(params: URLSearchParams, header: string | null, secret: string) {
  if (!header || !secret) return false;
  const payload = nestedForm(params);
  delete payload.sign;
  delete payload.signature;
  const expected = signProdamus(payload, secret);
  const actual = Buffer.from(header.trim().toLowerCase());
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

export async function loadProdamusSecret(agentId: string) {
  const agent = await loadPaymentAgent(agentId);
  return agent?.prodamusSecret ?? "";
}

/** Закрывает pending-платёж один раз и сообщает клиенту, CRM и исходящему вебхуку. */
export async function handlePaymentSucceeded(agentId: string, paymentId: string, expectedAmount?: number | null) {
  if (!UUID_PATTERN.test(agentId) || !UUID_PATTERN.test(paymentId)) return;
  const supabase = createSupabaseAdminClient();
  const existing = await supabase.from("agent_payments").select("id, agent_id, channel, chat_id, provider, external_id, amount, currency, description, status").eq("id", paymentId).eq("agent_id", agentId).maybeSingle();
  if (existing.error || !existing.data) return;
  const row = existing.data as PaymentRow;
  if (row.status === "succeeded") return;
  if (row.status !== "pending") return;
  const amount = Number(row.amount);
  if (expectedAmount !== undefined && expectedAmount !== null && Math.abs(expectedAmount - amount) > 0.01) {
    console.error("[payments] amount mismatch", agentId, paymentId);
    return;
  }

  const paidAt = new Date().toISOString();
  const updated = await supabase
    .from("agent_payments")
    .update({ status: "succeeded", paid_at: paidAt })
    .eq("id", paymentId)
    .eq("agent_id", agentId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (updated.error || !updated.data) return;

  const agent = await loadPaymentAgent(agentId);
  const currency = row.currency.toUpperCase();
  const notice = agent?.successMessage.trim()
    || `Оплата ${amount.toFixed(2)} ${currency} за «${row.description}» успешно получена! Спасибо!`;
  await notifyPaidChat(agent, row, notice);
  await emitPaymentWebhook(agentId, row, notice);
  const crmNote = `💳 Оплата получена (${providerLabel(isProvider(row.provider) ? row.provider : "stripe")}): ${amount.toFixed(2)} ${currency} — ${row.description}`;
  await Promise.all([
    noteAmoPayment(agentId, row.chat_id, crmNote),
    notePipedrivePayment(agentId, row.chat_id, crmNote),
    noteBitrixPayment(agentId, row.chat_id, crmNote),
  ]);
}

async function createPaymentLink(
  agent: PaymentAgent,
  provider: PaymentProvider,
  input: { amount: number; currency: string; description: string; channel: string; chatId: string },
) {
  const supabase = createSupabaseAdminClient();
  const inserted = await supabase
    .from("agent_payments")
    .insert({
      agent_id: agent.id,
      channel: (input.channel || "sandbox").slice(0, 40),
      chat_id: (input.chatId || agent.id).slice(0, 200),
      provider,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      payment_url: DEFAULT_RETURN,
      status: "pending",
    })
    .select("id")
    .single();
  if (inserted.error || !inserted.data) {
    const missing = /agent_payments|schema cache/i.test(inserted.error?.message ?? "");
    return { ok: false as const, error: missing ? "Примените миграцию 20261121_agent_payments.sql." : "Не удалось сохранить платёж." };
  }

  const draft: PaymentDraft = {
    id: String(inserted.data.id),
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    returnUrl: agent.returnUrl || DEFAULT_RETURN,
  };
  const link = provider === "stripe"
    ? await createStripeCheckout(agent, draft)
    : provider === "yookassa"
      ? await createYookassaPayment(agent, draft)
      : await createProdamusLink(agent, draft);
  if (!link.ok) {
    await supabase.from("agent_payments").update({ status: "failed" }).eq("id", draft.id);
    return link;
  }
  const saved = await supabase
    .from("agent_payments")
    .update({ external_id: link.externalId, payment_url: link.paymentUrl })
    .eq("id", draft.id);
  if (saved.error) return { ok: false as const, error: "Ссылка создана, но не сохранилась." };
  return {
    ok: true as const,
    payment_url: link.paymentUrl,
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    description: input.description,
  };
}

async function createStripeCheckout(agent: PaymentAgent, payment: PaymentDraft) {
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("line_items[0][price_data][currency]", payment.currency.toLowerCase());
  form.set("line_items[0][price_data][unit_amount]", String(Math.round(payment.amount * 100)));
  form.set("line_items[0][price_data][product_data][name]", payment.description);
  form.set("line_items[0][quantity]", "1");
  form.set("metadata[payment_id]", payment.id);
  form.set("success_url", payment.returnUrl);
  form.set("cancel_url", payment.returnUrl);
  const result = await requestJson("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agent.stripeSecret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!result.ok) return { ok: false as const, error: result.error };
  const record = asRecord(result.data);
  const externalId = typeof record.id === "string" ? record.id : "";
  const paymentUrl = typeof record.url === "string" ? record.url : "";
  if (!externalId || !paymentUrl.startsWith("https://")) return { ok: false as const, error: "Stripe не вернул ссылку на оплату." };
  return { ok: true as const, externalId, paymentUrl };
}

async function createYookassaPayment(agent: PaymentAgent, payment: PaymentDraft) {
  const result = await yookassaRequest(agent.yookassaShopId, agent.yookassaSecret, "/payments", {
    method: "POST",
    idempotence: payment.id,
    body: {
      amount: { value: payment.amount.toFixed(2), currency: payment.currency.toUpperCase() },
      confirmation: { type: "redirect", return_url: payment.returnUrl },
      capture: true,
      description: payment.description,
      metadata: { payment_id: payment.id },
    },
  });
  if (!result.ok) return { ok: false as const, error: result.error };
  const record = asRecord(result.data);
  const confirmation = asRecord(record.confirmation);
  const externalId = typeof record.id === "string" ? record.id : "";
  const paymentUrl = typeof confirmation.confirmation_url === "string" ? confirmation.confirmation_url : "";
  if (!externalId || !paymentUrl.startsWith("https://")) return { ok: false as const, error: "ЮKassa не вернула ссылку на оплату." };
  return { ok: true as const, externalId, paymentUrl };
}

async function createProdamusLink(agent: PaymentAgent, payment: PaymentDraft) {
  const shop = readProdamusShopUrl(agent.prodamusShopUrl);
  if (!shop || !agent.prodamusSecret) return { ok: false as const, error: "Продамус не настроен." };
  const payload = {
    order_id: payment.id,
    products: [{ name: payment.description, price: payment.amount.toFixed(2), quantity: "1" }],
    do: "link",
    sys: "strike",
    urlSuccess: payment.returnUrl,
  };
  const form = new URLSearchParams();
  form.set("order_id", payment.id);
  form.set("products[0][name]", payment.description);
  form.set("products[0][price]", payment.amount.toFixed(2));
  form.set("products[0][quantity]", "1");
  form.set("do", "link");
  form.set("sys", "strike");
  form.set("urlSuccess", payment.returnUrl);
  form.set("signature", signProdamus(payload, agent.prodamusSecret));
  const result = await requestText(shop, form);
  if (!result.ok) return { ok: false as const, error: result.error };
  const paymentUrl = prodamusUrl(result.text);
  if (!paymentUrl) return { ok: false as const, error: "Продамус не вернул ссылку на оплату." };
  return { ok: true as const, externalId: payment.id, paymentUrl };
}

async function testStripe(secret: string) {
  if (!secret.trim()) return { ok: false as const, error: "Укажите Secret Key Stripe." };
  const result = await requestJson("https://api.stripe.com/v1/balance", { method: "GET", headers: { Authorization: `Bearer ${secret.trim()}` } });
  return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
}

async function testYookassa(shopId: string, secret: string) {
  if (!/^\d{1,20}$/.test(shopId.trim()) || !secret.trim()) return { ok: false as const, error: "Укажите Shop ID и секретный ключ ЮKassa." };
  const result = await yookassaRequest(shopId.trim(), secret.trim(), "/me");
  if (!result.ok) return { ok: false as const, error: result.error };
  const accountId = asRecord(result.data).account_id;
  return { ok: true as const, ...(typeof accountId === "string" && accountId ? { accountId } : {}) };
}

async function testProdamus(shopUrl: string, secret: string) {
  const shop = readProdamusShopUrl(shopUrl);
  if (!shop) return { ok: false as const, error: "URL платёжной страницы должен быть https://....payform.ru." };
  if (readPaymentSecret(secret) === null || !secret.trim()) return { ok: false as const, error: "Укажите секретный ключ Продамус." };
  const probe = await createProdamusLink(
    { ...emptyAgent(), prodamusShopUrl: shop, prodamusSecret: secret.trim() },
    { id: crypto.randomUUID(), amount: 100, currency: "rub", description: "STRIKE connection test", returnUrl: DEFAULT_RETURN },
  );
  return probe.ok ? { ok: true as const } : { ok: false as const, error: probe.error };
}

async function yookassaRequest(shopId: string, secret: string, path: string, init?: { method?: "GET" | "POST"; body?: unknown; idempotence?: string }) {
  return requestJson(`https://api.yookassa.ru/v3${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Basic ${Buffer.from(`${shopId}:${secret}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(init?.idempotence ? { "Idempotence-Key": init.idempotence } : {}),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function requestJson(url: string, init: { method?: string; headers?: Record<string, string>; body?: string }) {
  const result = await requestText(url, init.body === undefined ? null : init.body, init.method, init.headers, init.body !== undefined);
  if (!result.ok) return result;
  try {
    return { ok: true as const, data: result.text ? JSON.parse(result.text) : null };
  } catch {
    return { ok: false as const, error: "Платёжный шлюз вернул не JSON." };
  }
}

async function requestText(
  url: string,
  body: string | URLSearchParams | null,
  method = "POST",
  headers?: Record<string, string>,
  json = false,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: body === null && method === "POST" ? "GET" : method,
      redirect: "manual",
      signal: controller.signal,
      headers: headers ?? (body instanceof URLSearchParams ? { "Content-Type": "application/x-www-form-urlencoded" } : json ? { "Content-Type": "application/json" } : {}),
      body: body === null ? undefined : body.toString(),
    });
    if (response.status >= 300 && response.status < 400) return { ok: false as const, error: "Платёжный шлюз вернул перенаправление." };
    const text = await response.text();
    if (!response.ok) return { ok: false as const, error: gatewayError(text, response.status) };
    return { ok: true as const, text };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false as const, error: aborted ? "Платёжный шлюз не ответил за 7 секунд." : "Не удалось связаться с платёжным шлюзом." };
  } finally {
    clearTimeout(timer);
  }
}

function gatewayError(text: string, status: number) {
  try {
    const record = asRecord(JSON.parse(text));
    const stripe = asRecord(record.error);
    const message = firstText(stripe.message, record.description, record.message, record.error);
    if (message) return message.slice(0, 300);
  } catch {
    // текстовый ответ шлюза
  }
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return (plain || `Платёжный шлюз ответил HTTP ${status}.`).slice(0, 300);
}

function signProdamus(payload: unknown, secret: string) {
  const json = JSON.stringify(sortDeep(payload)).replace(/\//g, "\\/");
  return createHmac("sha256", secret).update(json).digest("hex");
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) sorted[key] = sortDeep((value as Record<string, unknown>)[key]);
    return sorted;
  }
  return value;
}

function nestedForm(params: URLSearchParams) {
  const root: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) assignPath(root, key, value);
  return root;
}

function assignPath(root: Record<string, unknown>, key: string, value: string) {
  const parts = key.replace(/\]/g, "").split("[");
  let cursor: Record<string, unknown> | unknown[] = root;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? "";
    const last = index === parts.length - 1;
    if (last) {
      if (Array.isArray(cursor)) cursor[Number(part)] = value;
      else cursor[part] = value;
      return;
    }
    const next = parts[index + 1] ?? "";
    const asArray = /^\d+$/.test(next);
    const current = Array.isArray(cursor) ? cursor[Number(part)] : cursor[part];
    if (current == null || typeof current !== "object") {
      const created = asArray ? [] : {};
      if (Array.isArray(cursor)) cursor[Number(part)] = created;
      else cursor[part] = created;
      cursor = created;
    } else {
      cursor = current as Record<string, unknown> | unknown[];
    }
  }
}

function prodamusUrl(text: string) {
  const plain = text.trim().replace(/^"+|"+$/g, "");
  if (plain.startsWith("https://")) return plain.slice(0, 2000);
  try {
    const record = asRecord(JSON.parse(text));
    const url = firstText(record.payment_link, record.url, record.link);
    return url.startsWith("https://") ? url.slice(0, 2000) : "";
  } catch {
    return "";
  }
}

async function notifyPaidChat(agent: PaymentAgent | null, row: PaymentRow, text: string) {
  if (!agent) return;
  try {
    const supabase = createSupabaseAdminClient();
    const conversation = await findConversation(supabase, agent.id, row.chat_id);
    if (row.channel === "twilio") {
      const session = UUID_PATTERN.test(row.chat_id)
        ? await supabase.from("lead_sessions").select("phone").eq("id", row.chat_id).maybeSingle()
        : { data: null };
      const phone = typeof session.data?.phone === "string" ? session.data.phone.replace(/\D/g, "") : "";
      const account = await twilioAccountForUser(agent.userId);
      if (phone && account.account) await sendTextMessage(account.account, { phoneDigits: phone, body: text.slice(0, 1600) });
    } else if (conversation?.externalChatId) {
      await deliverChannel(agent, row.channel, conversation.provider, conversation.externalChatId, text);
    }
    if (!conversation) return;
    const { error } = await supabase.from("messages").insert({
      user_id: conversation.userId,
      conversation_id: conversation.id,
      role: "assistant",
      content: text.slice(0, 4000),
      status: "sent",
    });
    if (error && !/user_id/.test(error.message)) console.error("[payments] history", error.message);
    if (error?.code === "23502") {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        role: "assistant",
        content: text.slice(0, 4000),
        status: "sent",
      });
    }
    await supabase
      .from("conversations")
      .update({ last_message_preview: text.slice(0, 140), last_message_at: new Date().toISOString() })
      .eq("id", conversation.id);
  } catch (error) {
    console.error("[payments] notify", error instanceof Error ? error.message : error);
  }
}

async function deliverChannel(agent: PaymentAgent, channel: string, provider: string, externalChatId: string, text: string) {
  const kind = provider || channel;
  if (kind === "whatsapp" && agent.waInstanceId && agent.waApiToken) {
    await sendConnectedWhatsApp(agent.waInstanceId, agent.waApiToken, externalChatId, text);
    return;
  }
  if (kind === "telegram" && agent.telegramBotToken) {
    await fetch(`https://api.telegram.org/bot${agent.telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: externalChatId, text: text.slice(0, 4000) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return;
  }
  if (kind === "instagram" && agent.instagramPageId && agent.instagramAccessToken) {
    await fetch(`https://graph.facebook.com/v21.0/${agent.instagramPageId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${agent.instagramAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: externalChatId }, message: { text: text.slice(0, 900) } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  }
}

async function findConversation(supabase: ReturnType<typeof createSupabaseAdminClient>, agentId: string, chatId: string) {
  const columns = "id, user_id, external_chat_id, integrations(provider)";
  const byId = UUID_PATTERN.test(chatId)
    ? await supabase.from("conversations").select(columns).eq("id", chatId).eq("agent_id", agentId).maybeSingle()
    : { data: null, error: null };
  const row = byId.data ?? (await supabase.from("conversations").select(columns).eq("agent_id", agentId).eq("external_chat_id", chatId).limit(1)).data?.[0];
  if (!row) return null;
  const integration = Array.isArray(row.integrations) ? row.integrations[0] : row.integrations;
  return {
    id: String(row.id),
    userId: typeof row.user_id === "string" ? row.user_id : null,
    externalChatId: typeof row.external_chat_id === "string" ? row.external_chat_id : "",
    provider: typeof integration?.provider === "string" ? integration.provider : "",
  };
}

async function emitPaymentWebhook(agentId: string, row: PaymentRow, notice: string) {
  const target = await loadAgentWebhook(agentId);
  if (!target) return;
  const amount = Number(row.amount);
  await dispatchAgentWebhook(target, {
    event: "payment.succeeded",
    channel: row.channel,
    chat_id: row.chat_id,
    client: { name: null, phone: null, username: null },
    message: { role: "system", text: notice },
    metadata: {
      payment_id: row.id,
      provider: row.provider,
      external_id: row.external_id,
      amount,
      currency: row.currency.toUpperCase(),
      description: row.description,
    },
  });
}

async function loadPaymentAgent(agentId: string): Promise<PaymentAgent | null> {
  if (!UUID_PATTERN.test(agentId)) return null;
  try {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("agents")
      .select("id, user_id, stripe_secret_key, stripe_webhook_secret, stripe_currency, yookassa_shop_id, yookassa_secret_key, prodamus_shop_url, prodamus_secret_key, payment_success_message, payment_return_url, wa_instance_id, wa_api_token, telegram_bot_token, instagram_page_id, instagram_access_token")
      .eq("id", agentId)
      .maybeSingle();
    if (error || !data) return null;
    const stripeSecret = text(data.stripe_secret_key);
    const yookassaShopId = text(data.yookassa_shop_id);
    const yookassaSecret = text(data.yookassa_secret_key);
    const prodamusShopUrl = text(data.prodamus_shop_url);
    const prodamusSecret = text(data.prodamus_secret_key);
    if (!stripeSecret && !(yookassaShopId && yookassaSecret) && !(prodamusShopUrl && prodamusSecret) && !text(data.payment_success_message) && !text(data.payment_return_url)) {
      // Агент без оплат всё равно нужен вебхуку, если ключи уже были стёрты между созданием ссылки и оплатой.
    }
    return {
      id: String(data.id),
      userId: text(data.user_id),
      stripeSecret,
      stripeWebhookSecret: text(data.stripe_webhook_secret),
      stripeCurrency: readStripeCurrency(text(data.stripe_currency)) || "usd",
      yookassaShopId,
      yookassaSecret,
      prodamusShopUrl,
      prodamusSecret,
      successMessage: text(data.payment_success_message).slice(0, 2000),
      returnUrl: readPaymentReturnUrl(text(data.payment_return_url)) || DEFAULT_RETURN,
      waInstanceId: text(data.wa_instance_id),
      waApiToken: text(data.wa_api_token),
      telegramBotToken: text(data.telegram_bot_token),
      instagramPageId: text(data.instagram_page_id),
      instagramAccessToken: text(data.instagram_access_token),
    };
  } catch (error) {
    console.error("[payments] load", error instanceof Error ? error.message : error);
    return null;
  }
}

function connectedProviders(agent: PaymentAgent): PaymentProvider[] {
  const providers: PaymentProvider[] = [];
  if (agent.stripeSecret) providers.push("stripe");
  if (agent.yookassaShopId && agent.yookassaSecret) providers.push("yookassa");
  if (readProdamusShopUrl(agent.prodamusShopUrl) && agent.prodamusSecret) providers.push("prodamus");
  return providers;
}

function chooseProvider(requested: string, connected: PaymentProvider[], currency: string) {
  if (requested) return connected.includes(requested as PaymentProvider) ? (requested as PaymentProvider) : null;
  if (connected.length === 1) return connected[0];
  if (!currency) return null;
  if (currency === "rub" && connected.includes("yookassa")) return "yookassa";
  if (currency === "rub" && connected.includes("prodamus")) return "prodamus";
  if (currency !== "rub" && connected.includes("stripe")) return "stripe";
  return null;
}

function normalizeCurrency(value: string, provider: PaymentProvider, stripeCurrency: string) {
  const fallback = provider === "stripe" ? stripeCurrency : "rub";
  const currency = (value || fallback).trim().toLowerCase();
  return /^[a-z]{3}$/.test(currency) ? currency : null;
}

function readAmount(value: unknown) {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value.replace(/\s/g, "").replace(",", ".")) : NaN;
  if (!Number.isFinite(raw) || raw <= 0 || raw > 10_000_000) return null;
  return Math.round(raw * 100) / 100;
}

function providerLabel(provider: PaymentProvider) {
  if (provider === "stripe") return "Stripe";
  if (provider === "yookassa") return "ЮKassa";
  return "Продамус";
}

function isProvider(value: string): value is PaymentProvider {
  return value === "stripe" || value === "yookassa" || value === "prodamus";
}

function readArgs(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  return null;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function emptyAgent(): PaymentAgent {
  return {
    id: "",
    userId: "",
    stripeSecret: "",
    stripeWebhookSecret: "",
    stripeCurrency: "usd",
    yookassaShopId: "",
    yookassaSecret: "",
    prodamusShopUrl: "",
    prodamusSecret: "",
    successMessage: "",
    returnUrl: DEFAULT_RETURN,
    waInstanceId: "",
    waApiToken: "",
    telegramBotToken: "",
    instagramPageId: "",
    instagramAccessToken: "",
  };
}
