import "server-only";

import { readWidgetSettings, type WidgetSettings } from "@/lib/agent-models";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type WidgetConfig = WidgetSettings & {
  agentId: string;
  /** Имя агента из карточки (запасной вариант подписи, если widget_agent_name пуст). */
  agentName: string;
};

/**
 * Публичная конфигурация виджета по ID агента. Возвращает только то, что можно
 * показывать посетителям сайта: без системного промпта и секретов каналов.
 */
export async function getWidgetConfig(agentId: string): Promise<WidgetConfig | null> {
  if (!UUID_PATTERN.test(agentId)) return null;
  const supabase = createSupabaseAdminClient();

  const withPosition = await supabase
    .from("agents")
    .select(
      "id, name, is_active, widget_position, widget_agent_name, widget_operator_name, widget_auto_open, widget_open_delay, widget_color_header_bg, widget_color_header_text, widget_greeting, widget_avatar_agent, widget_avatar_operator",
    )
    .eq("id", agentId)
    .maybeSingle();

  const withSettings = withPosition.error?.message.includes("widget_position")
    ? await supabase
        .from("agents")
        .select(
          "id, name, is_active, widget_agent_name, widget_operator_name, widget_auto_open, widget_open_delay, widget_color_header_bg, widget_color_header_text, widget_greeting, widget_avatar_agent, widget_avatar_operator",
        )
        .eq("id", agentId)
        .maybeSingle()
    : withPosition;

  // Миграция widget_* ещё не применена: отдаём виджет с дефолтными настройками.
  const row = withSettings.error?.message.includes("widget_")
    ? (
        await supabase
          .from("agents")
          .select("id, name, is_active")
          .eq("id", agentId)
          .maybeSingle()
      ).data
    : withSettings.data;

  if (!row || row.is_active !== true) return null;

  return {
    agentId: String(row.id),
    agentName: typeof row.name === "string" && row.name.trim() ? row.name.trim() : "STRIKE",
    ...readWidgetSettings(row as Record<string, unknown>),
  };
}
