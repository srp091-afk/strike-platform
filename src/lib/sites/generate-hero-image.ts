import "server-only";

import { generateFluxPhotograph } from "@/lib/generate-creatives";
import type { StartLayout, ThemePreset } from "@/lib/sites/quiz-schema";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const BUCKET = "site-assets";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type HeroFile = { bytes: Buffer; contentType: string };

export async function prepareHeroImage(input: {
  nichePrompt: string;
  theme: ThemePreset;
  layout: StartLayout;
  wish?: string;
}): Promise<HeroFile | null> {
  if (!process.env.REPLICATE_API_TOKEN?.trim()) return null;
  try {
    const remote = await generateFluxPhotograph(heroPrompt(input), "16:9");
    const response = await fetch(remote, {
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: "image/*" },
    });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 32) return null;
    const header = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const contentType = header.startsWith("image/") ? header : "image/webp";
    return { bytes, contentType };
  } catch (error) {
    console.error("[generate-hero-image]", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function storeHeroImage(userId: string, siteId: string, file: HeroFile): Promise<string | null> {
  if (!UUID.test(userId) || !UUID.test(siteId)) return null;
  try {
    const admin = createSupabaseAdminClient();
    const existing = await admin.storage.getBucket(BUCKET);
    if (!existing.data) {
      const created = await admin.storage.createBucket(BUCKET, { public: true, fileSizeLimit: 25 * 1024 * 1024 });
      if (created.error && !/already exists|duplicate/i.test(created.error.message)) return null;
    }
    const extension = file.contentType.includes("png") ? "png" : file.contentType.includes("jpeg") ? "jpg" : "webp";
    const path = `${userId}/${siteId}/hero_media/${Date.now()}-hero.${extension}`;
    const upload = await admin.storage.from(BUCKET).upload(path, file.bytes, {
      contentType: file.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (upload.error) {
      console.error("[generate-hero-image] upload", upload.error.message);
      return null;
    }
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl || null;
  } catch (error) {
    console.error("[generate-hero-image] store", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Ждёт картинку не дольше timeoutMs. Если Flux не успел или ключ не задан — null, без исключения. */
export async function generateHeroImage(input: {
  userId: string;
  siteId: string;
  nichePrompt: string;
  theme: ThemePreset;
  layout: StartLayout;
  wish?: string;
  timeoutMs?: number;
  prepared?: Promise<HeroFile | null>;
}): Promise<string | null> {
  const timeoutMs = input.timeoutMs ?? 140_000;
  const prepared = input.prepared ?? prepareHeroImage(input);
  const file = await Promise.race([
    prepared,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);
  if (!file) return null;
  return storeHeroImage(input.userId, input.siteId, file);
}

function heroPrompt(input: { nichePrompt: string; theme: ThemePreset; layout: StartLayout; wish?: string }) {
  const wish = input.wish?.trim().slice(0, 140);
  const scene = wish
    ? `Photograph this exact scene and nothing else: ${wish}.`
    : sceneFor(input.nichePrompt);
  const light = input.theme === "light_minimal"
    ? "Bright natural daylight, pale stone, quiet luxury."
    : input.theme === "editorial_warm"
      ? "Warm editorial daylight, travertine and oak, soft shadow."
      : "Moody low-key lighting, deep shadows, one soft architectural highlight.";
  const frame = input.layout === "cinematic_hero" || input.layout === "spotlight_center"
    ? "Wide frame with calm empty space on the left and the subject on the right."
    : "One clear subject, generous negative space, no clutter.";
  return `No text, no letters, no numbers, no logos, no watermark, no collage. Pure editorial photography. ${scene} ${frame} ${light}`;
}

function sceneFor(prompt: string) {
  const text = prompt.toLowerCase();
  if (/ремонт|ванн|интерьер|отделк|кухн|строител/.test(text)) {
    return "Minimal designer apartment interior, precise joinery, quiet materials.";
  }
  if (/недвиж|вилл|квартир|апартамент|бали|дуба|дом\b/.test(text)) {
    return "Premium contemporary architecture, a quiet villa of stone and glass.";
  }
  if (/авто|машин|пригон/.test(text)) {
    return "A single premium car in a quiet concrete gallery, soft side light.";
  }
  if (/стомат|клиник|имплант|винир|медицин/.test(text)) {
    return "Calm premium clinic interior, stone, soft daylight, no signage.";
  }
  if (/маркет|b2b|агентств|аудит|реклам|лид|заявк|консалт|продаж/.test(text)) {
    return "Atmospheric modern dark glass office, tall windows, architectural light, empty room.";
  }
  return "Premium architectural interior matched to the brief, one clear subject.";
}
