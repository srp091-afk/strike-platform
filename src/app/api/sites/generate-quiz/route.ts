import { connection } from "next/server";

import { getEffectiveUserId } from "@/lib/account-context";
import { getOpenAI } from "@/lib/openai";
import { createQuizSite } from "@/lib/sites/store";
import { defaultConsultant, parseQuizSchema, type QuizSchema, type ThemePreset } from "@/lib/sites/quiz-schema";
import { repairGeneratedPreview } from "@/lib/sites/quiz-calculator";
import { polishGeneratedQuiz, stripMarkers } from "@/lib/sites/quiz-polish";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "subtitle", "startScreen", "steps", "calculator", "leadScreen", "thankYouScreen", "giftsConfig", "resultPreview", "consultant"],
  properties: {
    title: { type: "string" },
    subtitle: { type: "string" },
    startScreen: { type: "object", additionalProperties: true },
    giftsConfig: { type: "object", additionalProperties: true },
    steps: { type: "array", items: { type: "object", additionalProperties: true } },
    calculator: { type: "object", additionalProperties: true },
    leadScreen: { type: "object", additionalProperties: true },
    thankYouScreen: { type: "object", additionalProperties: true },
    resultPreview: { type: "object", additionalProperties: true },
    consultant: { type: "object", additionalProperties: true },
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
            "Язык — русский. Верни JSON со startScreen, giftsConfig, steps, calculator, leadScreen, thankYouScreen, resultPreview, title, subtitle.",
            "startScreen.layout: cinematic_hero. swiss_minimal только если это чистый B2B без визуального объекта.",
            "startScreen.eyebrow.text: точный нишевый тег из 3–5 слов. trustBadge.primaryText: короткий реалистичный факт-заглушка.",
            "headline: конкретный заголовок. В ==двойные равенства== оборачивай только короткую концовку с цифрой или условием, 2–4 слова. Весь заголовок целиком оборачивать запрещено.",
            "title: короткое имя проекта, 2–4 слова, без == и без **. startScreen.brand.name: название студии из 2–3 слов, не копия заголовка.",
            "subheadline.text: 1–2 прямых предложения без фразы «ответьте на несколько вопросов». bullets.items: ровно 4 коротких пункта, цифры оберни в **двойные звёздочки**, bullets.show true, layout auto.",
            "ctaText: глагол результата. ctaMicroText: { show: true, text: «N вопросов · займёт 45 сек» }.",
            "media: { type: none, url: null, overlayOpacity: 60, focalPoint: center }. highlightStyle: badge.",
            "giftsConfig: showOnStart, showInProgress и showOnThankYou true, sectionLabel «Бонус после прохождения», один item type file без fileUrl. title — конкретный PDF или чек-лист под нишу.",
            "step.type: single_choice | multi_choice | image_cards | range_slider | text_input.",
            "У single_choice и image_cards поле options: { id, label, description, imageUrl, nextStepId, priceImpact, numericValue }.",
            "Для бюджета, площади, срока и масштаба задай step.variableKey латиницей (budget, area, ad_spend) и numericValue или defaultNumericValue в валюте ниши.",
            "resultPreview.enabled true. template: financial_forecast для инвестиций, недвижимости и маркетинга; estimate_breakdown для ремонта, стройки и клиник; curated_match для подбора авто и жилья; diagnostic_audit для B2B-аудита и консалтинга.",
            "Собери 3 KPI с формулами от =переменная, таблицу или подборку из 3 строк: первая locked false, вторая и третья locked true. lockBadgeText вроде «Полный расчёт — в WhatsApp». 1–2 rules: если budget больше порога, смени headline и overrideVariables.",
            "Формулы только из чисел, скобок, + - * /, имён переменных и функций round floor ceil min max. Без текста внутри формулы.",
            "leadScreen.headline: «Куда прислать полный расчёт?». ctaText: «Получить расчёт в WhatsApp».",
            "consultant.enabled true. defaultMode text. name — реалистичное имя эксперта ниши, role — конкретная должность, например «Руководитель отдела зарубежной недвижимости» или «Ведущий сметчик». aiAvatarId: alexei, mark, ivan, elena, anna или maria. showOnLeadScreen false.",
            "У каждого шага helper: { enabled: true, mode: inherit, text, customVideoUrl: null }. helper.text — 110–180 символов, факт или снятие возражения, ключевую цифру оберни в **звёздочки**.",
            "Запрещено: «ответьте, чтобы мы подобрали», «это поможет нам понять вас». На одном очевидном шаге допустима короткая строка.",
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
    let payload: { title?: string; subtitle?: string; steps?: unknown } = {};
    try {
      payload = JSON.parse(raw) as { title?: string; subtitle?: string; steps?: unknown };
    } catch (parseError) {
      console.error("generate-quiz: не удалось разобрать JSON модели", parseError);
    }
    const generated = payload;
    const parsed = parseQuizSchema(payload);
    const polished = polishGeneratedQuiz(repairGeneratedPreview(withConsultant(parsed), prompt), prompt, generated.title ?? "");
    if (polished.replacedSteps) {
      console.error("generate-quiz: шаги модели не подошли, собран нишевый сценарий", { prompt: prompt.slice(0, 180), rawSteps: Array.isArray(generated.steps) ? generated.steps.length : 0 });
    }
    const site = await createQuizSite({
      title: stripMarkers(polished.title) || "Квиз",
      subtitle: stripMarkers(generated.subtitle?.trim() || ""),
      prompt,
      schema: polished.schema,
      preset,
      agentId: agent?.id ?? null,
      subdomain: body.subdomain || polished.subdomainSeed,
    });
    return Response.json({ id: site.id });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Не удалось собрать квиз." }, { status: 500 });
  }
}

function withConsultant(schema: QuizSchema): QuizSchema {
  const consultant = { ...defaultConsultant(true), ...schema.consultant, enabled: true };
  if (!consultant.name.trim()) consultant.name = "Алексей Громов";
  return {
    ...schema,
    consultant,
    steps: schema.steps.map((step) => {
      const tip = step.helper.text.trim();
      return {
        ...step,
        expertTip: tip.slice(0, 180) || step.expertTip,
        helper: {
          ...step.helper,
          enabled: Boolean(tip),
          text: tip,
          aiAvatar: { ...step.helper.aiAvatar, script: step.helper.aiAvatar.script || tip },
        },
      };
    }),
  };
}

async function loadAgent(userId: string, agentId: string) {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from("agents").select("id, name, system_prompt").eq("id", agentId).eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { id: String(data.id), name: String(data.name ?? "Агент"), prompt: String(data.system_prompt ?? "").slice(0, 1200) };
}
