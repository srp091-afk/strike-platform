import { connection } from "next/server";

import { deniedStatus, getEffectiveUserId } from "@/lib/account-context";
import { publishQuiz, saveQuizDraft } from "@/lib/sites/store";
import type { AnalyticsConfig, QuizSchema, SeoConfig, ThemeConfig } from "@/lib/sites/quiz-schema";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  try {
    await getEffectiveUserId();
    const body = (await request.json().catch(() => null)) as {
      title?: string;
      subdomain?: string;
      customDomain?: string | null;
      theme?: ThemeConfig;
      draft?: QuizSchema;
      analytics?: AnalyticsConfig;
      seo?: SeoConfig;
      agentId?: string | null;
    } | null;
    if (body?.draft && body.theme && body.analytics && body.seo && typeof body.title === "string") {
      await saveQuizDraft(id, {
        title: body.title,
        subdomain: typeof body.subdomain === "string" ? body.subdomain : undefined,
        customDomain: typeof body.customDomain === "string" && body.customDomain.trim() ? body.customDomain.trim().toLowerCase() : null,
        theme: body.theme,
        draft: body.draft,
        analytics: body.analytics,
        seo: body.seo,
        agentId: body.agentId || null,
      });
    }
    const published = await publishQuiz(id);
    return Response.json({
      ok: true,
      status: published.status,
      subdomain: published.subdomain,
      publicUrl: published.publicUrl,
    });
  } catch (error) {
    console.error("publish quiz failed", error);
    const message = error instanceof Error ? error.message : "Не удалось опубликовать.";
    const missing = message === "Квиз не найден.";
    const unauthorized = message.includes("Нужно войти");
    return Response.json(
      { ok: false, error: message },
      { status: missing ? 404 : deniedStatus(error, unauthorized ? 401 : 400) },
    );
  }
}
