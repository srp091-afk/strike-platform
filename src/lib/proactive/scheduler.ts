import "server-only";

import { readDelivery, planSlots, type ProactiveChannel } from "@/lib/proactive/delivery";
import { readTimeZone } from "@/lib/outreach-schedule";
import { zonedDayStart } from "@/lib/outreach-schedule";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type QueueRow = {
  id: string;
  campaign_id: string;
  channel: ProactiveChannel;
  created_at: string;
};

export async function scheduleTasks(userId: string, taskIds: string[]) {
  if (taskIds.length === 0) return { ok: true as const, scheduled: 0 };
  const admin = createSupabaseAdminClient();
  const tasks = await admin
    .from("agent_action_queue")
    .select("id, campaign_id, channel, created_at, status")
    .eq("user_id", userId)
    .in("id", taskIds)
    .in("status", ["pending_approval", "scheduled", "failed"]);
  if (tasks.error) return { ok: false as const, error: tasks.error.message };
  const rows = (tasks.data ?? []) as QueueRow[];
  if (rows.length === 0) return { ok: true as const, scheduled: 0 };

  const campaignIds = [...new Set(rows.map((row) => row.campaign_id))];
  const campaigns = await admin
    .from("proactive_campaigns")
    .select("id, channel, delivery_config, status")
    .eq("user_id", userId)
    .in("id", campaignIds);
  if (campaigns.error) return { ok: false as const, error: campaigns.error.message };
  const deliveryByCampaign = new Map(
    (campaigns.data ?? []).map((campaign) => [
      String(campaign.id),
      { channel: campaign.channel as ProactiveChannel, config: readDelivery(campaign.delivery_config, campaign.channel as ProactiveChannel), paused: campaign.status === "paused" },
    ]),
  );
  const timezone = await readZone(admin, userId);
  const now = new Date();
  let scheduled = 0;

  const groups = new Map<string, QueueRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.campaign_id) ?? [];
    bucket.push(row);
    groups.set(row.campaign_id, bucket);
  }

  for (const [campaignId, group] of groups) {
    const campaign = deliveryByCampaign.get(campaignId);
    if (!campaign || campaign.paused) continue;
    const ordered = [...group].sort((left, right) => left.created_at.localeCompare(right.created_at));
    const ids = new Set(ordered.map((row) => row.id));
    const cursor = await lastCursor(admin, userId, campaign.channel, ids, now);
    const sentToday = await countToday(admin, userId, campaignId, timezone, now, ids);
    const slots = planSlots({
      count: ordered.length,
      config: campaign.config,
      timezone,
      now,
      cursor,
      sentToday,
    });
    for (let index = 0; index < ordered.length; index += 1) {
      const slot = slots[index];
      if (!slot) continue;
      const updated = await admin
        .from("agent_action_queue")
        .update({ status: "scheduled", scheduled_for: slot.toISOString(), error_message: null })
        .eq("id", ordered[index].id)
        .eq("user_id", userId);
      if (!updated.error) scheduled += 1;
    }
  }
  return { ok: true as const, scheduled };
}

export async function rescheduleCampaign(userId: string, campaignId: string) {
  const admin = createSupabaseAdminClient();
  const waiting = await admin
    .from("agent_action_queue")
    .select("id")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .eq("status", "scheduled");
  if (waiting.error) return { ok: false as const, error: waiting.error.message };
  return scheduleTasks(userId, (waiting.data ?? []).map((row) => String(row.id)));
}

async function readZone(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const row = await admin.from("profiles").select("timezone").eq("id", userId).maybeSingle();
  if (row.error) return "UTC";
  return readTimeZone(row.data?.timezone);
}

async function lastCursor(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  channel: ProactiveChannel,
  ignore: Set<string>,
  now: Date,
) {
  const queued = await admin
    .from("agent_action_queue")
    .select("id, scheduled_for")
    .eq("user_id", userId)
    .eq("channel", channel)
    .in("status", ["scheduled", "sending"])
    .order("scheduled_for", { ascending: false })
    .limit(30);
  let cursor = now;
  for (const row of queued.data ?? []) {
    if (ignore.has(String(row.id)) || typeof row.scheduled_for !== "string") continue;
    const time = new Date(row.scheduled_for);
    if (time > cursor) cursor = time;
  }
  return cursor;
}

async function countToday(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  campaignId: string,
  timezone: string,
  now: Date,
  ignore: Set<string>,
) {
  const start = zonedDayStart(now, timezone).toISOString();
  const sent = await admin
    .from("agent_action_queue")
    .select("id, sent_at, scheduled_for, status")
    .eq("user_id", userId)
    .eq("campaign_id", campaignId)
    .in("status", ["sent", "scheduled", "sending"])
    .limit(500);
  let count = 0;
  for (const row of sent.data ?? []) {
    if (ignore.has(String(row.id))) continue;
    const stamp = row.status === "sent" ? row.sent_at : row.scheduled_for;
    if (typeof stamp === "string" && stamp >= start) count += 1;
  }
  return count;
}
