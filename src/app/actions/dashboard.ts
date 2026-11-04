"use server";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { getOpenAI } from "@/lib/openai";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type PulseInsight = { title: string; text: string };
export type PulseReport = { trend: PulseInsight; risk: PulseInsight; trigger: PulseInsight };
export type PulseResult = { ok: true; report: PulseReport; generatedAt: string } | { ok: false; error: string };

const SAMPLE_SIZE = 80;
const MAX_MESSAGE_CHARS = 280;

const SYSTEM_PROMPT =
  'Проанализируй недавние диалоги с клиентами. Выдели 3 бизнес-инсайта в формате JSON: 1 тренд спроса, 1 проблему/риск, 1 успешный триггер. Пиши кратко, по-русски. ' +
  'Верни строго JSON вида {"trend":{"title":"...","text":"..."},"risk":{"title":"...","text":"..."},"trigger":{"title":"...","text":"..."}}. ' +
  "title — до 90 символов, text — одно предложение до 140 символов. Не выдумывай факты, опирайся только на переданные диалоги.";

/** Убирает телефоны, e-mail, ссылки и длинные числа: на модель уходит только обезличенный текст. */
function sanitize(text: string) {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/https?:\/\/\S+/g, "[ссылка]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[номер]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
}

function readInsight(value: unknown): PulseInsight | null {
  if (!value || typeof value !== "object") return null;
  const { title, text } = value as { title?: unknown; text?: unknown };
  if (typeof title !== "string" || typeof text !== "string" || !title.trim()) return null;
  return { title: title.trim().slice(0, 140), text: text.trim().slice(0, 240) };
}

export async function generateAIPulseReport(): Promise<PulseResult> {
  try {
    const userId = await getAuthenticatedUserId();
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .from("messages")
      .select("role, content, created_at, conversations!inner(user_id)")
      .eq("conversations.user_id", userId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(SAMPLE_SIZE);

    if (error) return { ok: false, error: error.message };

    const lines = (data ?? [])
      .reverse()
      .map((row) => ({ role: row.role === "user" ? "Клиент" : "AI", text: sanitize(String(row.content ?? "")) }))
      .filter((row) => row.text);

    if (lines.length < 5) {
      return { ok: false, error: "Недостаточно диалогов для анализа: нужно хотя бы несколько сообщений." };
    }

    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: lines.map((line) => `${line.role}: ${line.text}`).join("\n") },
      ],
    });

    const parsed = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
    const trend = readInsight(parsed.trend);
    const risk = readInsight(parsed.risk);
    const trigger = readInsight(parsed.trigger);
    if (!trend || !risk || !trigger) return { ok: false, error: "Модель вернула неполный отчёт. Попробуйте ещё раз." };

    return { ok: true, report: { trend, risk, trigger }, generatedAt: new Date().toISOString() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Не удалось сгенерировать отчёт." };
  }
}
