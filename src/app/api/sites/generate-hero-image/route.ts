import { connection } from "next/server";

import { deniedStatus, getEffectiveUserId } from "@/lib/account-context";
import { generateHeroImage } from "@/lib/sites/generate-hero-image";
import type { StartLayout, ThemePreset } from "@/lib/sites/quiz-schema";
import { getOwnedSite } from "@/lib/sites/store";

export const maxDuration = 60;

const LAYOUTS = new Set<StartLayout>(["cinematic_hero", "editorial_split", "spotlight_center", "swiss_minimal"]);

export async function POST(request: Request) {
  await connection();
  try {
    const userId = await getEffectiveUserId();
    const body = (await request.json()) as {
      siteId?: string;
      nichePrompt?: string;
      theme?: string;
      layout?: string;
      wish?: string;
    };
    const siteId = body.siteId?.trim() ?? "";
    const nichePrompt = body.nichePrompt?.trim().slice(0, 800) ?? "";
    if (!siteId || nichePrompt.length < 2) return Response.json({ error: "Не хватает данных для фона." }, { status: 400 });
    const site = await getOwnedSite(siteId);
    if (!site || site.siteType !== "quiz") return Response.json({ error: "Квиз не найден." }, { status: 404 });
    if (!process.env.REPLICATE_API_TOKEN?.trim()) {
      return Response.json({ error: "Не задан ключ Replicate." }, { status: 503 });
    }
    const theme: ThemePreset = body.theme === "light_minimal" || body.theme === "editorial_warm" ? body.theme : "dark_premium";
    const layout: StartLayout = LAYOUTS.has(body.layout as StartLayout) ? (body.layout as StartLayout) : "cinematic_hero";
    const url = await generateHeroImage({
      userId,
      siteId,
      nichePrompt,
      theme,
      layout,
      wish: body.wish?.trim().slice(0, 140) ?? "",
      timeoutMs: 50_000,
    });
    if (!url) return Response.json({ error: "Не удалось сгенерировать фон. Попробуйте ещё раз." }, { status: 502 });
    return Response.json({ url });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Нужно войти") ? "Нужно войти." : error instanceof Error ? error.message : "Не удалось сгенерировать фон.";
    return Response.json({ error: message }, { status: deniedStatus(error, message === "Нужно войти." ? 401 : 500) });
  }
}
