import type { NextRequest } from "next/server";

import { normalizeAgentModel } from "@/lib/agent-models";
import { getLanding } from "@/lib/landings";
import { getOpenAI } from "@/lib/openai";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      landingId?: string;
      messages?: { role?: string; content?: string }[];
    };
    if (!body.landingId) return Response.json({ error: "Воронка не найдена." }, { status: 404 });

    const landing = await getLanding(body.landingId);
    if (!landing) return Response.json({ error: "Воронка не найдена." }, { status: 404 });

    const dialogue = (body.messages ?? [])
      .filter((item) => (item.role === "user" || item.role === "assistant") && item.content?.trim())
      .slice(-12)
      .map((item) => ({
        role: item.role as "user" | "assistant",
        content: item.content!.trim().slice(0, 4000),
      }));

    const agent = landing.agentId ? await loadAgent(landing.agentId) : null;
    const model = normalizeAgentModel(agent?.model);
    const completion = await getOpenAI().chat.completions.create({
      model,
      temperature: clamp(agent?.temperature),
      messages: [
        {
          role: "system",
          content:
            agent?.system_prompt ||
            `Ты консультант лендинга «${landing.title}». ${landing.welcomeMessage} Веди к следующему шагу коротко и по делу.`,
        },
        ...dialogue,
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim() || "Уточните, пожалуйста, задачу.";
    return Response.json({ reply });
  } catch (error) {
    console.error("[landing-chat]", error instanceof Error ? error.message : error);
    return Response.json({ error: "Не удалось ответить." }, { status: 500 });
  }
}

async function loadAgent(agentId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("agents")
    .select("system_prompt, model, temperature, is_active")
    .eq("id", agentId)
    .maybeSingle();
  if (error || !data || data.is_active === false) return null;
  return {
    system_prompt: String(data.system_prompt ?? ""),
    model: normalizeAgentModel(data.model),
    temperature: Number(data.temperature),
  };
}

function clamp(value: number | undefined) {
  if (!Number.isFinite(value)) return 0.7;
  return Math.min(2, Math.max(0, value ?? 0.7));
}
