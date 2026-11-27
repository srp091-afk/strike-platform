import { connection } from "next/server";

import { deniedStatus, getEffectiveUserId } from "@/lib/account-context";
import { getOwnedSite } from "@/lib/sites/store";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const maxDuration = 60;

const BUCKET = "site-assets";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FILES = {
  jpg: { group: "image", mime: "image/jpeg" },
  jpeg: { group: "image", mime: "image/jpeg" },
  png: { group: "image", mime: "image/png" },
  webp: { group: "image", mime: "image/webp" },
  avif: { group: "image", mime: "image/avif" },
  mp4: { group: "video", mime: "video/mp4" },
  webm: { group: "video", mime: "video/webm" },
  mov: { group: "video", mime: "video/quicktime" },
  pdf: { group: "file", mime: "application/pdf" },
  docx: { group: "file", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xlsx: { group: "file", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  pptx: { group: "file", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  zip: { group: "file", mime: "application/zip" },
} as const;

const LIMIT = { image: 8 * 1024 * 1024, video: 25 * 1024 * 1024, file: 20 * 1024 * 1024 };
const KIND = new Set(["hero_media", "gift_cover", "gift_file", "logo", "option_image", "consultant_avatar", "consultant_video"]);

export async function POST(request: Request) {
  await connection();
  try {
    const userId = await getEffectiveUserId();
    const form = await request.formData();
    const file = form.get("file");
    const siteId = String(form.get("siteId") ?? "");
    const kind = String(form.get("kind") ?? "");
    if (!(file instanceof File)) return Response.json({ error: "Файл не передан." }, { status: 400 });
    if (!UUID.test(siteId) || !KIND.has(kind)) return Response.json({ error: "Некорректный запрос." }, { status: 400 });
    const site = await getOwnedSite(siteId);
    if (!site || site.siteType !== "quiz") return Response.json({ error: "Квиз не найден." }, { status: 404 });

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const spec = FILES[extension as keyof typeof FILES];
    if (!spec) return Response.json({ error: "Этот формат не подходит." }, { status: 400 });
    if ((kind === "gift_cover" || kind === "logo" || kind === "option_image" || kind === "consultant_avatar") && spec.group !== "image") {
      return Response.json({ error: "Нужно изображение." }, { status: 400 });
    }
    if (kind === "consultant_avatar" && file.size > 5 * 1024 * 1024) {
      return Response.json({ error: "Фото больше 5 МБ." }, { status: 400 });
    }
    if (kind === "consultant_video" && spec.group !== "video") return Response.json({ error: "Нужно видео mp4, webm или mov." }, { status: 400 });
    if (kind === "gift_file" && spec.group !== "file") return Response.json({ error: "Нужен PDF, DOCX, XLSX, PPTX или ZIP." }, { status: 400 });
    if (kind === "hero_media" && spec.group === "file") return Response.json({ error: "Для фона нужно фото или видео." }, { status: 400 });
    if (file.size <= 0 || file.size > LIMIT[spec.group]) {
      return Response.json({ error: spec.group === "video" ? "Видео больше 25 МБ." : spec.group === "file" ? "Файл больше 20 МБ." : "Изображение больше 8 МБ." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    await ensureBucket(admin);
    const safe = `${file.name.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "file"}.${extension}`;
    const path = `${userId}/${siteId}/${kind}/${Date.now()}-${safe}`;
    const upload = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: spec.mime,
      upsert: false,
    });
    if (upload.error) return Response.json({ error: upload.error.message }, { status: 500 });
    const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
    return Response.json({ url: data.publicUrl, fileName: file.name.slice(0, 180), size: file.size, mimeType: spec.mime });
  } catch (error) {
    const message = error instanceof Error && error.message.includes("Нужно войти") ? "Нужно войти." : error instanceof Error ? error.message : "Не удалось загрузить файл.";
    return Response.json({ error: message }, { status: deniedStatus(error, message === "Нужно войти." ? 401 : 500) });
  }
}

async function ensureBucket(admin: ReturnType<typeof createSupabaseAdminClient>) {
  const existing = await admin.storage.getBucket(BUCKET);
  if (existing.data) return;
  const created = await admin.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: LIMIT.video,
    allowedMimeTypes: Object.values(FILES).map((item) => item.mime),
  });
  if (created.error && !/already exists|duplicate/i.test(created.error.message)) throw new Error(created.error.message);
}
