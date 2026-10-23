import type { NextRequest } from "next/server";

import { normalizeAgentModel, readActiveChannels } from "@/lib/agent-models";
import { getOpenAI } from "@/lib/openai";
import { replyChunks, systemPromptWithSplit } from "@/lib/reply";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { appendWidgetReply, openWidgetThread, readVisitorId, type WidgetThread } from "@/lib/widget-inbox";

export const maxDuration = 60;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Публичный чат веб-виджета (/widget/chat/<agentId>). Агент адресуется своим
 * UUID, посетитель не авторизован; отдаём только текст ответа модели.
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Некорректный JSON." }, { status: 400 });
  }

  const record = asRecord(body);
  const agentId = stringValue(record.agent_id);
  // Полный диалог, включая стартовое приветствие assistant. text + history —
  // прежний контракт, где реплика посетителя приходила отдельно.
  const dialogue = sanitizeHistory(record.messages ?? record.history);
  const text = stringValue(record.text);
  const last = dialogue[dialogue.length - 1];
  const userText = last?.role === "user" ? last.content : text;
  const messages = last?.role === "user" ? dialogue : [...dialogue, { role: "user" as const, content: text }];

  if (!UUID_PATTERN.test(agentId)) {
    return Response.json({ error: "Виджет не найден." }, { status: 404 });
  }
  if (!userText) {
    return Response.json({ error: "Пустое сообщение." }, { status: 400 });
  }
  if (userText.length > 8000) {
    return Response.json({ error: "Сообщение слишком длинное." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const withWidget = await supabase
    .from("agents")
    .select("id, user_id, system_prompt, model, temperature, is_active, active_channels, split_messages, widget_greeting, widget_operator_name")
    .eq("id", agentId)
    .maybeSingle();
  const loaded = withWidget.error?.message.includes("widget_")
    ? await supabase
        .from("agents")
        .select("id, user_id, system_prompt, model, temperature, is_active, active_channels, split_messages")
        .eq("id", agentId)
        .maybeSingle()
    : withWidget;
  const agent = loaded.data;
  const error = loaded.error;

  if (error) {
    return Response.json({ error: "Не удалось загрузить агента." }, { status: 500 });
  }
  if (!agent || agent.is_active !== true || typeof agent.user_id !== "string") {
    return Response.json({ error: "Виджет не найден." }, { status: 404 });
  }
  if (!readActiveChannels(agent.active_channels).widget) {
    return Response.json({ error: "Виджет отключён." }, { status: 404 });
  }

  const visitorId = readVisitorId(record.visitor_id);
  let thread: WidgetThread | null = null;
  try {
    thread = await openWidgetThread(supabase, { agent, visitorId, userText });
  } catch (failure) {
    console.warn("[widget-chat] dialogue", failure instanceof Error ? failure.message : failure);
  }

  if (thread && !thread.botActive) {
    return Response.json({
      reply: "Сообщение получено. Оператор ответит вам в этом чате.",
      visitor_id: visitorId,
    });
  }

  try {
    const model = normalizeAgentModel(agent.model);
    const completion = await getOpenAI().chat.completions.create({
      model,
      temperature: model.includes("gpt-6") ? 1 : clampTemperature(agent.temperature),
      messages: [
        {
          role: "system",
          content: systemPromptWithSplit(
            typeof agent.system_prompt === "string" && agent.system_prompt ? agent.system_prompt : "You are a STRIKE agent.",
            agent.split_messages,
          ),
        },
        ...messages,
      ],
    });

    const reply = replyChunks(completion.choices[0]?.message?.content?.trim() ?? "", agent.split_messages).join("\n\n");
    if (!reply) {
      return Response.json({ error: "Модель вернула пустой ответ." }, { status: 502 });
    }
    if (thread) {
      try {
        await appendWidgetReply(supabase, thread.conversationId, reply);
      } catch (failure) {
        console.warn("[widget-chat] reply", failure instanceof Error ? failure.message : failure);
      }
    }
    return Response.json({ reply, visitor_id: visitorId });
  } catch (failure) {
    return Response.json(
      { error: failure instanceof Error ? failure.message : "Не удалось получить ответ." },
      { status: 502 },
    );
  }
}

function sanitizeHistory(value: unknown): HistoryMessage[] {
  if (!Array.isArray(value)) return [];
  const clean = value
    .map((item) => {
      const record = asRecord(item);
      const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
      const content = stringValue(record.content);
      if (!role || !content) return null;
      return { role, content: content.slice(0, 8000) } satisfies HistoryMessage;
    })
    .filter((item): item is HistoryMessage => item !== null);
  if (clean.length <= 40) return clean;
  // Первое сообщение — приветствие виджета. Его оставляем даже в длинном диалоге.
  const [first, ...rest] = clean;
  return first ? [first, ...rest.slice(-39)] : rest.slice(-40);
}

function clampTemperature(value: unknown) {
  const temperature = Number(value);
  if (!Number.isFinite(temperature)) return 0.7;
  return Math.min(2, Math.max(0, temperature));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  return "";
}
