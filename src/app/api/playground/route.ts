import type { NextRequest } from "next/server";

import { getOpenAI } from "@/lib/openai";
import { replyChunks, systemPromptWithSplit } from "@/lib/reply";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

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

  if (!agentId) {
    return Response.json({ error: "Выбери агента." }, { status: 400 });
  }

  if (!text) {
    return Response.json({ error: "Пустое сообщение." }, { status: 400 });
  }

  if (text.length > 8000) {
    return Response.json({ error: "Сообщение слишком длинное." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: agent, error } = await loadPlaygroundAgent(supabase, agentId);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!agent || !agent.is_active) {
    return Response.json({ error: "Агент не найден или выключен." }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const model = (agent.model as string) || "gpt-4o-mini";
        const completion = await getOpenAI().chat.completions.create({
          model,
          temperature: model.includes("gpt-6") ? 1 : clampTemperature(agent.temperature),
          messages: [
            {
              role: "system",
              content: systemPromptWithSplit(
                (agent.system_prompt as string) || "You are a STRIKE agent.",
                agent.split_messages,
              ),
            },
            ...history,
            { role: "user", content: text },
          ],
        });

        const reply = completion.choices[0]?.message?.content?.trim() ?? "";
        const chunks = replyChunks(reply, agent.split_messages);
        if (chunks.length === 0) {
          send({ type: "error", message: "Модель вернула пустой ответ." });
          return;
        }

        chunks.forEach((content, index) => {
          send({ type: "chunk", index, content });
        });
        send({ type: "done" });
      } catch (failure) {
        send({
          type: "error",
          message: failure instanceof Error ? failure.message : "Не удалось получить ответ.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function loadPlaygroundAgent(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  agentId: string,
) {
  const withSplit = await supabase
    .from("agents")
    .select("id, name, system_prompt, model, temperature, is_active, split_messages")
    .eq("id", agentId)
    .maybeSingle();

  if (!withSplit.error || !withSplit.error.message.includes("split_messages")) {
    return withSplit;
  }

  const fallback = await supabase
    .from("agents")
    .select("id, name, system_prompt, model, temperature, is_active")
    .eq("id", agentId)
    .maybeSingle();

  return {
    data: fallback.data ? { ...fallback.data, split_messages: null } : null,
    error: fallback.error,
  };
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
