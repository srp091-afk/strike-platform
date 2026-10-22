"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import {
  readWidgetAvatar,
  readWidgetColor,
  readWidgetDelay,
  readWidgetPosition,
  readWidgetSettings,
  readWidgetText,
  DEFAULT_WIDGET_SETTINGS,
  type WidgetSettings,
} from "@/lib/agent-models";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Не экспортируется: в "use server"-файле допустимы только async-функции и типы,
// экспорт константы роняет сборку Turbopack ("The module has no exports at all").
const WIDGET_AVATARS_BUCKET = "widget_avatars";

export type WidgetAvatarRole = "agent" | "operator";

const AVATAR_COLUMN: Record<WidgetAvatarRole, "widget_avatar_agent" | "widget_avatar_operator"> = {
  agent: "widget_avatar_agent",
  operator: "widget_avatar_operator",
};

const AVATAR_CONTENT_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

async function agentInWorkspace(agentId: string) {
  const supabase = createSupabaseAdminClient();
  const userId = await getAuthenticatedUserId();
  const { data, error } = await supabase
    .from("agents")
    .select("id")
    .eq("id", agentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? supabase : null;
}

function normalizeWidgetSettings(input: WidgetSettings): WidgetSettings | { error: string } {
  const settings: WidgetSettings = {
    widget_position: readWidgetPosition(input.widget_position),
    widget_agent_name: readWidgetText(input.widget_agent_name, DEFAULT_WIDGET_SETTINGS.widget_agent_name),
    widget_operator_name: readWidgetText(input.widget_operator_name, DEFAULT_WIDGET_SETTINGS.widget_operator_name),
    widget_auto_open: input.widget_auto_open === true,
    widget_open_delay: readWidgetDelay(input.widget_open_delay),
    widget_color_header_bg: readWidgetColor(input.widget_color_header_bg, DEFAULT_WIDGET_SETTINGS.widget_color_header_bg),
    widget_color_header_text: readWidgetColor(
      input.widget_color_header_text,
      DEFAULT_WIDGET_SETTINGS.widget_color_header_text,
    ),
    widget_greeting: readWidgetText(input.widget_greeting, DEFAULT_WIDGET_SETTINGS.widget_greeting, 1000),
    widget_avatar_agent: readWidgetAvatar(input.widget_avatar_agent),
    widget_avatar_operator: readWidgetAvatar(input.widget_avatar_operator),
  };

  for (const url of [settings.widget_avatar_agent, settings.widget_avatar_operator]) {
    if (url && !/^https?:\/\//i.test(url)) return { error: "URL аватара должен начинаться с http:// или https://." };
  }
  return settings;
}

/** Сохранить настройки веб-виджета агента из WidgetConnectModal. */
export async function saveWidgetSettings(agentId: string, input: WidgetSettings) {
  if (!UUID_PATTERN.test(agentId)) return { ok: false as const, error: "Сначала сохраните агента.", settings: null };

  const normalized = normalizeWidgetSettings(input);
  if ("error" in normalized) return { ok: false as const, error: normalized.error, settings: null };

  try {
    const supabase = await agentInWorkspace(agentId);
    if (!supabase) return { ok: false as const, error: "Агент не найден.", settings: null };

    const { error } = await supabase.from("agents").update({ ...normalized }).eq("id", agentId);
    if (error?.message.includes("widget_position")) {
      return {
        ok: false as const,
        error: "Примените миграцию 20261022_widget_position.sql, чтобы сохранять расположение виджета.",
        settings: null,
      };
    }
    if (error) return { ok: false as const, error: error.message, settings: null };

    revalidatePath("/agents");
    return { ok: true as const, error: null, settings: normalized };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Не удалось сохранить настройки виджета.",
      settings: null,
    };
  }
}

let bucketReady: Promise<void> | null = null;

/** Страховочное создание бакета, если миграция ещё не применена (канон — SQL-миграция). */
async function ensureWidgetAvatarsBucket(supabase: ReturnType<typeof createSupabaseAdminClient>) {
  if (!bucketReady) {
    bucketReady = (async () => {
      const existing = await supabase.storage.getBucket(WIDGET_AVATARS_BUCKET);
      if (existing.data) return;
      const created = await supabase.storage.createBucket(WIDGET_AVATARS_BUCKET, {
        public: true,
        allowedMimeTypes: Object.keys(AVATAR_CONTENT_TYPES),
        fileSizeLimit: "5MB",
      });
      if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
        console.error("[widget-avatars] createBucket", created.error.message);
      }
    })();
  }
  try {
    await bucketReady;
  } catch (error) {
    bucketReady = null;
    throw error;
  }
}

/**
 * Загрузка аватара виджета в Supabase Storage (бакет widget_avatars).
 * Файл кладётся в `${agentId}/${role}-${Date.now()}.<ext>`, публичный URL сразу
 * пишется в колонку агента и возвращается на клиент для live-превью.
 */
export async function uploadWidgetAvatar(file: File, agentId: string, role: WidgetAvatarRole) {
  if (!UUID_PATTERN.test(agentId)) return { ok: false as const, url: null, error: "Сначала сохраните агента." };
  if (role !== "agent" && role !== "operator") return { ok: false as const, url: null, error: "Некорректная роль аватара." };
  if (!file || typeof file.size !== "number" || file.size === 0) {
    return { ok: false as const, url: null, error: "Файл пустой." };
  }
  if (file.size > MAX_AVATAR_BYTES) return { ok: false as const, url: null, error: "Аватар больше 5 МБ." };

  const extension = AVATAR_CONTENT_TYPES[file.type];
  if (!extension) return { ok: false as const, url: null, error: "Нужна картинка PNG, JPEG, WebP, GIF или AVIF." };

  try {
    const supabase = await agentInWorkspace(agentId);
    if (!supabase) return { ok: false as const, url: null, error: "Агент не найден." };

    await ensureWidgetAvatarsBucket(supabase);

    const fileName = `${agentId}/${role}-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(WIDGET_AVATARS_BUCKET)
      .upload(fileName, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (uploadError) return { ok: false as const, url: null, error: uploadError.message };

    const { data } = supabase.storage.from(WIDGET_AVATARS_BUCKET).getPublicUrl(fileName);
    if (!data.publicUrl) return { ok: false as const, url: null, error: "Supabase не вернул публичный URL." };

    const column = AVATAR_COLUMN[role];
    const { error: updateError } = await supabase
      .from("agents")
      .update({ [column]: data.publicUrl })
      .eq("id", agentId);
    if (updateError) return { ok: false as const, url: null, error: updateError.message };

    revalidatePath("/agents");
    return { ok: true as const, url: data.publicUrl, error: null };
  } catch (error) {
    return {
      ok: false as const,
      url: null,
      error: error instanceof Error ? error.message : "Не удалось загрузить аватар.",
    };
  }
}

/** Текущие настройки виджета агента (для перечитывания формы после внешних правок). */
export async function loadWidgetSettings(agentId: string) {
  if (!UUID_PATTERN.test(agentId)) return { ok: false as const, error: "Сначала сохраните агента.", settings: null };
  try {
    const supabase = await agentInWorkspace(agentId);
    if (!supabase) return { ok: false as const, error: "Агент не найден.", settings: null };
    const withPosition = await supabase
      .from("agents")
      .select(
        "widget_position, widget_agent_name, widget_operator_name, widget_auto_open, widget_open_delay, widget_color_header_bg, widget_color_header_text, widget_greeting, widget_avatar_agent, widget_avatar_operator",
      )
      .eq("id", agentId)
      .maybeSingle();
    const { data, error } = withPosition.error?.message.includes("widget_position")
      ? await supabase
          .from("agents")
          .select(
            "widget_agent_name, widget_operator_name, widget_auto_open, widget_open_delay, widget_color_header_bg, widget_color_header_text, widget_greeting, widget_avatar_agent, widget_avatar_operator",
          )
          .eq("id", agentId)
          .maybeSingle()
      : withPosition;
    if (error) return { ok: false as const, error: error.message, settings: null };
    return { ok: true as const, error: null, settings: readWidgetSettings(data as Record<string, unknown>) };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Не удалось загрузить настройки виджета.",
      settings: null,
    };
  }
}
