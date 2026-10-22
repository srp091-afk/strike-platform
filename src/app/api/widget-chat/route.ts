import type { NextRequest } from "next/server";

import { normalizeAgentModel } from "@/lib/agent-models";
import { getOpenAI } from "@/lib/openai";
import { replyChunks, systemPromptWithSplit } from "@/lib/reply";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

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
  const text = stringValue(record.text);
  const history = sanitizeHistory(record.history);

  if (!UUID_PATTERN.test(agentId)) {
    return Response.json({ error: "Виджет не найден." }, { status: 404 });
  }
  if (!text) {
    return Response.json({ error: "Пустое сообщение." }, { status: 400 });
  }
  if (text.length > 8000) {
    return Response.json({ error: "Сообщение слишком длинное." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, system_prompt, model, temperature, is_active, split_messages")
    .eq("id", agentId)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "Не удалось загрузить агента." }, { status: 500 });
  }
  if (!agent || agent.is_active !== true) {
    return Response.json({ error: "Виджет не найден." }, { status: 404 });
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
        ...history,
        { role: "user", content: text },
      ],
    });

    const reply = replyChunks(completion.choices[0]?.message?.content?.trim() ?? "", agent.split_messages).join("\n\n");
    if (!reply) {
      return Response.json({ error: "Модель вернула пустой ответ." }, { status: 502 });
    }
    return Response.json({ reply });
  } catch (failure) {
    return Response.json(
      { error: failure instanceof Error ? failure.message : "Не удалось получить ответ." },
      { status: 502 },
    );
  }
}

function sanitizeHistory(value: unknown): HistoryMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      const role = record.role === "assistant" ? "assistant" : record.role === "user" ? "user" : null;
      const content = stringValue(record.content);
      if (!role || !content) return null;
      return { role, content: content.slice(0, 8000) } satisfies HistoryMessage;
    })
    .filter((item): item is HistoryMessage => item !== null)
    .slice(-40);
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
