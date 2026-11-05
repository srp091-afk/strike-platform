import "server-only";

import { generateOutreachMessage } from "@/lib/outreach-generate";
import { OUTREACH_CHANNELS } from "@/lib/outreach-types";
import { sendGreenMessage } from "@/lib/green-api";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type ProcessResult = { status: "skipped" | "success" | "error"; detail?: string };

/**
 * Обрабатывает ОДНУ строку базы: парсинг сайта -> генерация -> отправка -> запись в outreach_logs.
 * Вызывается воркером очереди (/api/outreach/worker). Ошибка строки не останавливает кампанию.
 * Входящие ответы клиентов идут обычным вебхуком канала в стандартную логику агента.
 */
export async function processOutreachLog(logId: string): Promise<ProcessResult> {
  const supabase = createSupabaseAdminClient();
  const { data: log } = await supabase
    .from("outreach_logs")
    .select("id, campaign_id, contact_data, strike_status")
    .eq("id", logId)
    .maybeSingle();
  if (!log || log.strike_status !== "queued") return { status: "skipped", detail: "строка уже обработана или удалена" };

  // Атомарный захват строки: повторная доставка QStash или повторный запуск после паузы не отправят дубль.
  const { data: claimed } = await supabase
    .from("outreach_logs")
    .update({ strike_error: "processing" })
    .eq("id", logId)
    .eq("strike_status", "queued")
    .is("strike_error", null)
    .select("id");
  if (!claimed?.length) return { status: "skipped", detail: "строка уже в обработке" };
  const release = () => supabase.from("outreach_logs").update({ strike_error: null }).eq("id", logId);

  const { data: campaign } = await supabase
    .from("outreach_campaigns")
    .select("id, user_id, agent_id, channel_type, outreach_prompt, daily_limit, status, contact_column, website_column, name_column, social_column, message_type, fixed_message, webhook_url")
    .eq("id", log.campaign_id)
    .maybeSingle();
  if (!campaign || campaign.status !== "active") {
    await release();
    return { status: "skipped", detail: "кампания не активна" };
  }

  const fail = async (message: string): Promise<ProcessResult> => {
    await supabase.from("outreach_logs").update({ strike_status: "error", strike_error: message }).eq("id", logId);
    await notifyWebhook(campaign.webhook_url, { status: "error", error: message, contact: log.contact_data });
    return { status: "error", detail: message };
  };

  // Суточный лимит: строка остаётся в очереди, QStash повторит её позже (ответ 429 в роуте).
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase
    .from("outreach_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("strike_status", "success")
    .gte("strike_sent_time", dayStart.toISOString());
  if ((count ?? 0) >= Number(campaign.daily_limit)) {
    await release();
    return { status: "skipped", detail: "daily_limit" };
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id, name, system_prompt, model, wa_instance_id, wa_api_token")
    .eq("id", campaign.agent_id)
    .eq("user_id", campaign.user_id)
    .maybeSingle();
  if (!agent) return fail("Агент кампании не найден");

  const contact = Object.fromEntries(
    Object.entries((log.contact_data ?? {}) as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")]),
  );
  const channel = campaign.channel_type as string;
  const channelLabel = OUTREACH_CHANNELS.find((item) => item.value === channel)?.label ?? channel;

  const generated = await generateOutreachMessage({
    outreachPrompt: String(campaign.outreach_prompt ?? ""),
    agentName: String(agent.name),
    agentPrompt: String(agent.system_prompt ?? ""),
    channelLabel,
    contact,
    messageType: campaign.message_type === "fixed" ? "fixed" : "ai",
    fixedMessage: String(campaign.fixed_message ?? ""),
    mapping: {
      contact: campaign.contact_column,
      website: campaign.website_column,
      name: campaign.name_column,
      social: campaign.social_column,
    },
    model: agent.model,
  });
  if (!generated.ok) return fail(generated.error);

  const target = campaign.contact_column ? (contact[campaign.contact_column] ?? "") : "";
  if (channel !== "whatsapp") return fail(`Отправка через ${channelLabel} пока не подключена к рассылкам`);
  const digits = target.replace(/\D/g, "");
  if (digits.length < 8) return fail("Некорректный номер телефона");
  if (!agent.wa_instance_id || !agent.wa_api_token) return fail("У агента не подключён WhatsApp");

  try {
    await sendGreenMessage(`${digits}@c.us`, generated.message, {
      idInstance: String(agent.wa_instance_id),
      apiToken: String(agent.wa_api_token),
    });
  } catch (error) {
    return fail(`Ошибка отправки: ${error instanceof Error ? error.message : "неизвестная"}`);
  }

  const sentAt = new Date().toISOString();
  await supabase
    .from("outreach_logs")
    .update({ strike_status: "success", strike_sent_time: sentAt, strike_message: generated.message, strike_error: null })
    .eq("id", logId);
  await notifyWebhook(campaign.webhook_url, { status: "success", sent_at: sentAt, message: generated.message, contact });

  // Все строки обработаны -> кампания завершена.
  const { count: left } = await supabase
    .from("outreach_logs")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaign.id)
    .eq("strike_status", "queued");
  if (!left) await supabase.from("outreach_campaigns").update({ status: "completed" }).eq("id", campaign.id);

  return { status: "success" };
}

async function notifyWebhook(url: unknown, payload: Record<string, unknown>) {
  if (typeof url !== "string" || !/^https:\/\//i.test(url)) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // Вебхук клиента не должен ломать рассылку.
  }
}
