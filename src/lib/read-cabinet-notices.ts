import "server-only";

import { readActiveChannels } from "@/lib/agent-models";
import type { NotificationSettings } from "@/lib/auth-user";
import { collectCabinetNotices, type ChannelAlert } from "@/lib/cabinet-notices";
import { readTimeZone } from "@/lib/outreach-schedule";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const DEFAULTS: NotificationSettings = {
  lowBalance: true,
  subscription: true,
  channelAlerts: true,
};

const RECENT_MS = 5 * 24 * 60 * 60 * 1000;

export async function readCabinetNotices(userId: string) {
  if (!userId) return [];
  try {
    const admin = createSupabaseAdminClient();
    const [prefs, credits, subscription, recent, channels] = await Promise.all([
      readPrefs(admin, userId),
      readCredits(admin, userId),
      readSubscription(admin, userId),
      readRecentSubscription(admin, userId),
      readChannelAlerts(admin, userId),
    ]);
    return collectCabinetNotices({
      lowBalance: prefs.notifications.lowBalance,
      subscription: prefs.notifications.subscription,
      channelAlerts: prefs.notifications.channelAlerts,
      timezone: prefs.timezone,
      credits,
      subscriptionStatus: subscription.status,
      subscriptionEndsAt: subscription.endsAt,
      recentSubscriptionAt: recent,
      channels,
    });
  } catch (error) {
    console.error("[notices]", error instanceof Error ? error.message : error);
    return [];
  }
}

async function readPrefs(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const row = await admin.from("profiles").select("notification_settings, timezone").eq("id", userId).maybeSingle();
  if (row.error) {
    if (!/notification_settings|timezone/.test(row.error.message)) {
      console.error("[notices] prefs", row.error.message);
    }
    return { notifications: DEFAULTS, timezone: "UTC" };
  }
  return {
    notifications: readNotifications(row.data?.notification_settings),
    timezone: readTimeZone(row.data?.timezone),
  };
}

function readNotifications(value: unknown): NotificationSettings {
  const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    lowBalance: record.low_balance !== false,
    subscription: record.subscription !== false,
    channelAlerts: record.channel_alerts !== false,
  };
}

async function readCredits(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const row = await admin.from("profiles").select("strike_credits").eq("id", userId).maybeSingle();
  if (row.error || row.data == null) return 0;
  const credits = Number(row.data.strike_credits ?? 0);
  return Number.isFinite(credits) ? credits : 0;
}

async function readSubscription(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const row = await admin
    .from("profiles")
    .select("subscription_status, subscription_ends_at")
    .eq("id", userId)
    .maybeSingle();
  if (row.error) {
    const statusOnly = await admin.from("profiles").select("subscription_status").eq("id", userId).maybeSingle();
    return {
      status: typeof statusOnly.data?.subscription_status === "string" ? statusOnly.data.subscription_status : null,
      endsAt: null,
    };
  }
  return {
    status: typeof row.data?.subscription_status === "string" ? row.data.subscription_status : null,
    endsAt: typeof row.data?.subscription_ends_at === "string" ? row.data.subscription_ends_at : null,
  };
}

async function readRecentSubscription(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const row = await admin
    .from("billing_transactions")
    .select("created_at")
    .eq("user_id", userId)
    .eq("kind", "subscription")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (row.error || typeof row.data?.created_at !== "string") return null;
  return row.data.created_at;
}

async function readChannelAlerts(admin: ReturnType<typeof createSupabaseAdminClient>, userId: string) {
  const full = await admin
    .from("agents")
    .select("id, name, is_active, active_channels, wa_instance_id, wa_phone_number, wa_is_active, instagram_account_id, instagram_access_token")
    .eq("user_id", userId);
  const rows = full.error ? await readAgentsWithoutInstagram(admin, userId, full.error.message) : (full.data ?? []);
  const problems: ChannelAlert[] = [];
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    const agentId = typeof record.id === "string" ? record.id : "";
    if (!agentId) continue;
    const name = typeof record.name === "string" && record.name.trim() ? record.name.trim() : "Агент";
    const channels = readActiveChannels(record.active_channels);
    const instance = typeof record.wa_instance_id === "string" ? record.wa_instance_id.trim() : "";
    const phone = typeof record.wa_phone_number === "string" ? record.wa_phone_number.trim() : "";
    if (instance && phone && record.wa_is_active !== true) {
      problems.push({ agentId, agentName: name, provider: "whatsapp", state: "disconnected" });
    }
    const hasInstagram = "instagram_account_id" in record;
    const instagramId = typeof record.instagram_account_id === "string" ? record.instagram_account_id.trim() : "";
    const instagramToken = typeof record.instagram_access_token === "string" ? record.instagram_access_token.trim() : "";
    if (hasInstagram && channels.instagram && (!instagramId || !instagramToken)) {
      problems.push({ agentId, agentName: name, provider: "instagram", state: "error" });
    }
    if (channels.widget && record.is_active !== true) {
      problems.push({ agentId, agentName: name, provider: "widget", state: "disconnected" });
    }
  }

  const integrations = await admin
    .from("integrations")
    .select("agent_id, provider, status")
    .eq("user_id", userId)
    .in("provider", ["whatsapp", "instagram", "widget"])
    .in("status", ["error", "disconnected"]);
  if (integrations.error || !integrations.data) return problems;

  for (const row of integrations.data) {
    const provider = row.provider;
    if (provider !== "whatsapp" && provider !== "instagram" && provider !== "widget") continue;
    const agentId = typeof row.agent_id === "string" ? row.agent_id : "";
    if (!agentId || problems.some((item) => item.agentId === agentId && item.provider === provider)) continue;
    if (row.status !== "error") continue;
    const agent = rows.find((item) => String((item as { id?: unknown }).id) === agentId) as { name?: unknown } | undefined;
    const name = typeof agent?.name === "string" && agent.name.trim() ? agent.name.trim() : "Агент";
    problems.push({ agentId, agentName: name, provider, state: "error" });
  }
  return problems;
}

async function readAgentsWithoutInstagram(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  message: string,
) {
  if (!/instagram_/.test(message)) {
    console.error("[notices] agents", message);
    return [];
  }
  const basic = await admin
    .from("agents")
    .select("id, name, is_active, active_channels, wa_instance_id, wa_phone_number, wa_is_active")
    .eq("user_id", userId);
  if (basic.error) {
    console.error("[notices] agents", basic.error.message);
    return [];
  }
  return basic.data ?? [];
}
