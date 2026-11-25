import "server-only";

import { Resend } from "resend";

import { sendEmailReply, type EmailConfig } from "@/lib/email-channel";
import { isEvolutionInstance, sendConnectedWhatsApp, sendTextMessage } from "@/lib/evolution-api";
import { markdownToTelegramHtml } from "@/lib/telegram-format";
import { sourceAdapter } from "@/lib/proactive/connectors";
import type { PostAction } from "@/lib/proactive/connectors/types";
import { recordOutboundChat } from "@/lib/proactive/inbox";
import { planDueCampaigns } from "@/lib/proactive/planner";
import { dialogIsStale } from "@/lib/proactive/stale";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Claimed = {
  id: string;
  user_id: string;
  campaign_id: string;
  agent_id: string;
  source_id: string;
  contact_name: string;
  contact_target: string;
  channel: "whatsapp" | "telegram" | "email";
  ai_reasoning: string;
  draft_subject: string | null;
  draft_message: string;
  post_action: PostAction | null;
  context_payload: Record<string, string> | null;
  conversation_id?: string | null;
  snapshot_last_msg_at?: string | null;
};

export async function executeDueProactive(options?: { userId?: string; plan?: boolean }) {
  if (options?.plan) await planDueCampaigns();
  const admin = createSupabaseAdminClient();
  const claimed = await admin.rpc("claim_proactive_actions", {
    p_limit: 40,
    p_user_id: options?.userId ?? null,
  });
  if (claimed.error) {
    const missing = /claim_proactive_actions|agent_action_queue/.test(claimed.error.message);
    return { ok: false as const, error: missing ? "Примените миграцию 20261126_proactive_core.sql." : claimed.error.message, sent: 0, failed: 0 };
  }
  const rows = (claimed.data ?? []) as Claimed[];
  let sent = 0;
  let failed = 0;
  const emails = rows.filter((row) => row.channel === "email");
  const messengers = rows.filter((row) => row.channel !== "email");
  for (const row of messengers) {
    const result = await deliverOne(admin, row);
    if (result === "sent") sent += 1;
    else if (result === "failed") failed += 1;
  }
  const emailResults = await Promise.all(emails.map((row) => deliverOne(admin, row)));
  for (const result of emailResults) {
    if (result === "sent") sent += 1;
    else if (result === "failed") failed += 1;
  }
  return { ok: true as const, sent, failed, error: null };
}

async function deliverOne(admin: ReturnType<typeof createSupabaseAdminClient>, row: Claimed): Promise<"sent" | "failed" | "stale"> {
  const credits = await readCredits(admin, row.user_id);
  if (credits < 1) {
    await fail(admin, row, "Закончились STRIKE Credits. Отправка остановлена.");
    return "failed";
  }
  const agent = await admin
    .from("agents")
    .select("wa_instance_id, wa_api_token, wa_is_active, telegram_bot_token, tg_bot_token, email_address, email_password, email_imap_host, email_imap_port, email_smtp_host, email_smtp_port")
    .eq("id", row.agent_id)
    .maybeSingle();
  if (agent.error || !agent.data) {
    await fail(admin, row, "Агент не найден.");
    return "failed";
  }
  if (await dialogIsStale({ conversationId: row.conversation_id ?? null, snapshot: row.snapshot_last_msg_at ?? null })) {
    await admin
      .from("agent_action_queue")
      .update({ status: "stale", error_message: "Клиент написал новое сообщение — задача снята с отправки" })
      .eq("id", row.id)
      .eq("status", "sending");
    return "stale";
  }
  const sent = await sendByChannel(row, agent.data as Record<string, unknown>);
  if (!sent.ok) {
    await fail(admin, row, sent.error);
    return "failed";
  }
  await spendOne(admin, row.user_id, `proactive_send_${row.id}`);
  await admin
    .from("agent_action_queue")
    .update({ status: "sent", sent_at: new Date().toISOString(), error_message: sent.note })
    .eq("id", row.id);
  await recordOutboundChat(admin, {
    userId: row.user_id,
    agentId: row.agent_id,
    provider: row.channel,
    externalId: sent.integrationExternalId,
    chatId: sent.chatId,
    contactName: row.contact_name || row.contact_target,
    message: row.draft_message,
    context: row.ai_reasoning,
  }).catch((error) => console.error("[proactive chat]", error instanceof Error ? error.message : error));
  await runPostAction(admin, row, sent.chatId).catch((error) => console.error("[proactive post]", error instanceof Error ? error.message : error));
  return "sent";
}

async function sendByChannel(row: Claimed, agent: Record<string, unknown>): Promise<
  { ok: true; chatId: string; integrationExternalId: string; note: string | null } | { ok: false; error: string }
> {
  const text = row.draft_message.trim();
  if (!text) return { ok: false, error: "Пустой текст." };
  if (row.channel === "whatsapp") return sendWhatsApp(agent, row.contact_target, text);
  if (row.channel === "telegram") return sendTelegram(agent, row.agent_id, row.contact_target, text);
  return sendEmail(agent, row.agent_id, row.contact_target, row.draft_subject || "Сообщение", text);
}

async function sendWhatsApp(agent: Record<string, unknown>, phone: string, text: string) {
  const instance = typeof agent.wa_instance_id === "string" ? agent.wa_instance_id.trim() : "";
  if (!instance || agent.wa_is_active !== true) return { ok: false as const, error: "WhatsApp агента не подключён." };
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 8) return { ok: false as const, error: "В контакте нет номера телефона." };
  try {
    if (isEvolutionInstance(instance)) await sendTextMessage(instance, digits, text);
    else await sendConnectedWhatsApp(instance, String(agent.wa_api_token ?? ""), digits, text);
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "WhatsApp не отправил сообщение." };
  }
  return { ok: true as const, chatId: `${digits}@s.whatsapp.net`, integrationExternalId: instance, note: null };
}

async function sendTelegram(agent: Record<string, unknown>, agentId: string, target: string, text: string) {
  const token = textOf(agent.telegram_bot_token) || textOf(agent.tg_bot_token);
  if (!token) return { ok: false as const, error: "У агента нет токена Telegram-бота." };
  const chat = target.trim();
  if (!chat) return { ok: false as const, error: "В контакте нет Telegram." };
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: markdownToTelegramHtml(text), parse_mode: "HTML" }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!response?.ok) return { ok: false as const, error: "Telegram не принял сообщение. Клиент должен сначала написать боту." };
  const payload = (await response.json().catch(() => null)) as { result?: { chat?: { id?: number } } } | null;
  const chatId = payload?.result?.chat?.id ? String(payload.result.chat.id) : chat;
  return { ok: true as const, chatId, integrationExternalId: `tg:${agentId}`, note: null };
}

async function sendEmail(agent: Record<string, unknown>, agentId: string, to: string, subject: string, text: string) {
  const config = emailConfig(agent);
  if (config) {
    const sent = await sendEmailReply({ config, to, subject, text });
    if (!sent.ok) return { ok: false as const, error: sent.error };
    return { ok: true as const, chatId: to.trim().toLowerCase(), integrationExternalId: `email:${agentId}`, note: null };
  }
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  if (!apiKey) return { ok: false as const, error: "Нет SMTP агента и RESEND_API_KEY." };
  const from = process.env.RESEND_FROM_EMAIL?.trim() || "STRIKE <onboarding@resend.dev>";
  try {
    const { error } = await new Resend(apiKey).emails.send({ from, to: [to], subject: subject.slice(0, 180), text });
    if (error) return { ok: false as const, error: error.message };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Письмо не отправилось." };
  }
  return { ok: true as const, chatId: to.trim().toLowerCase(), integrationExternalId: `email:${agentId}`, note: null };
}

function emailConfig(agent: Record<string, unknown>): EmailConfig | null {
  const email = textOf(agent.email_address).toLowerCase();
  const password = textOf(agent.email_password);
  const imapHost = textOf(agent.email_imap_host);
  const smtpHost = textOf(agent.email_smtp_host);
  if (!email || !password || !imapHost || !smtpHost) return null;
  return {
    email,
    password,
    imapHost,
    imapPort: Number(agent.email_imap_port) || 993,
    smtpHost,
    smtpPort: Number(agent.email_smtp_port) || 465,
  };
}

async function runPostAction(admin: ReturnType<typeof createSupabaseAdminClient>, row: Claimed, contact: string) {
  const source = await admin.from("proactive_sources").select("type, config").eq("id", row.source_id).maybeSingle();
  if (!source.data) return;
  const adapter = sourceAdapter(String(source.data.type));
  if (!adapter) return;
  const config = source.data.config && typeof source.data.config === "object" ? (source.data.config as Record<string, unknown>) : {};
  const action = row.post_action ?? {};
  const dealId = row.context_payload?.dealId;
  await adapter.executePostAction(config, { ...action, deal_id: action.deal_id || dealId }, { message: row.draft_message, contact });
}

async function fail(admin: ReturnType<typeof createSupabaseAdminClient>, row: Claimed, error: string) {
  await admin.from("agent_action_queue").update({ status: "failed", error_message: error.slice(0, 400) }).eq("id", row.id);
}

async function readCredits(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const row = await admin.from("profiles").select("strike_credits").eq("id", userId).maybeSingle();
  const credits = Number(row.data?.strike_credits ?? 0);
  return Number.isFinite(credits) ? credits : 0;
}

async function spendOne(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string, orderId: string) {
  await admin.rpc("spend_strike_credits", {
    p_user_id: userId,
    p_credits: 1,
    p_order_id: orderId,
    p_description: "Отправка проактивного сообщения · 1 SC",
  });
}

function textOf(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
