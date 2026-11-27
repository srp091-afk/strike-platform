import { connection } from "next/server";

import { getEffectiveUserId } from "@/lib/account-context";
import { getOpenAI } from "@/lib/openai";
import { createQuizSite } from "@/lib/sites/store";
import { parseQuizSchema, type ThemePreset } from "@/lib/sites/quiz-schema";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "startScreen", "steps", "calculator", "leadScreen", "thankYouScreen"],
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    startScreen: { type: "object", additionalProperties: true },
    steps: { type: "array", items: { type: "object", additionalProperties: true } },
    calculator: { type: "object", additionalProperties: true },
    leadScreen: { type: "object", additionalProperties: true },
    thankYouScreen: { type: "object", additionalProperties: true },
  },
} as const;

export async function POST(request: Request) {
  await connection();
  try {
    const body = (await request.json()) as {
      prompt?: string;
      agentId?: string | null;
      preset?: ThemePreset;
      subdomain?: string;
    };
    const prompt = body.prompt?.trim() ?? "";
    if (prompt.length < 8) return Response.json({ error: "Опишите нишу хотя бы одним предложением." }, { status: 400 });
    const userId = await getEffectiveUserId();
    const agent = body.agentId ? await loadAgent(userId, body.agentId) : null;
    const preset = body.preset === "light_minimal" || body.preset === "editorial_warm" ? body.preset : "dark_premium";
    const completion = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: [
            "Ты проектируешь квиз для прямого отклика. Пиши коротко и конкретно, без фраз вроде «уникальные решения» и «лидеры рынка».",
            "4–6 вопросов. Каждый квалифицирует: бюджет, срок, параметры, цель. У варианта 3–5 конкретных ответов.",
            "Язык — русский. Верни JSON со startScreen, steps, calculator, leadScreen, thankYouScreen, title, subtitle.",
            "step.type: single_choice | multi_choice | image_cards | range_slider | text_input.",
            "У single_choice и image_cards поле options: { id, label, description, imageUrl, nextStepId, priceImpact }.",
          ].join("\n"),
        },
        {
          role: "user",
          content: `${prompt}${agent ? `\n\nАгент «${agent.name}». Роль: ${agent.prompt}` : ""}`,
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "quiz", strict: false, schema: SCHEMA } },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return Response.json({ error: "Модель ничего не вернула." }, { status: 502 });
    const generated = JSON.parse(raw) as { title?: string; subtitle?: string };
    const schema = parseQuizSchema(JSON.parse(raw));
    const site = await createQuizSite({
      title: generated.title?.trim() || "Квиз",
      subtitle: generated.subtitle?.trim() || "",
      prompt,
      schema,
      preset,
      agentId: agent?.id ?? null,
      subdomain: body.subdomain,
    });
    return Response.json({ id: site.id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось собрать квиз." }, { status: 500 });
  }
}

async function loadAgent(userId: string, agentId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("agents").select("id, name, system_prompt").eq("id", agentId).eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { id: String(data.id), name: String(data.name ?? "Агент"), prompt: String(data.system_prompt ?? "").slice(0, 1200) };
}
