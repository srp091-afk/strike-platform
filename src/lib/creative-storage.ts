import "server-only";

import { randomUUID } from "crypto";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const CREATIVES_BUCKET = "creatives";

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/avif": "avif",
};

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  avif: "image/avif",
};

let bucketReady: Promise<void> | null = null;

/** Permanent public URL already owned by our Supabase `creatives` bucket. */
export function isPersistentCreativeUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  return value.includes(`/storage/v1/object/public/${CREATIVES_BUCKET}/`);
}

function isPlaceholderUrl(url: string): boolean {
  return /placehold\.co/i.test(url);
}

function extensionFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]+)$/i);
    if (!match) return null;
    const ext = match[1]!.toLowerCase();
    return ext in CONTENT_TYPE_BY_EXTENSION ? ext : null;
  } catch {
    return null;
  }
}

/**
 * Make sure the public `creatives` bucket exists.
 * The SQL migration is the canonical setup; this is a runtime safety net for
 * projects where the migration has not been applied yet. Cached per process.
 */
async function ensureCreativesBucket(): Promise<void> {
  if (bucketReady) return bucketReady;

  bucketReady = (async () => {
    const supabase = createSupabaseAdminClient();
    const existing = await supabase.storage.getBucket(CREATIVES_BUCKET);
    if (existing.data) return;

    const created = await supabase.storage.createBucket(CREATIVES_BUCKET, {
      public: true,
      allowedMimeTypes: Object.keys(EXTENSION_BY_CONTENT_TYPE),
      fileSizeLimit: "20MB",
    });
    if (created.error && !/already exists|duplicate/i.test(created.error.message)) {
      // Do not memoize a hard failure as fatal: upload below will surface it.
      console.error("[creative-storage] createBucket", created.error.message);
    }
  })();

  try {
    await bucketReady;
  } catch (error) {
    bucketReady = null;
    throw error;
  }
}

/**
 * Download a (temporary) Replicate/Flux URL and re-upload it to Supabase
 * Storage, returning the permanent public URL.
 *
 * On any storage/download failure the original URL is returned (with a log),
 * so one storage hiccup does not lose the whole creative batch.
 */
export async function persistCreativeImage(sourceUrl: string): Promise<string> {
  const source = sourceUrl.trim();
  if (!source || !/^https?:\/\//i.test(source)) return sourceUrl;
  if (isPersistentCreativeUrl(source) || isPlaceholderUrl(source)) return source;

  try {
    await ensureCreativesBucket();
    const supabase = createSupabaseAdminClient();

    const response = await fetch(source, {
      // Replicate CDN can be slow to start streaming; keep a bounded wait.
      signal: AbortSignal.timeout(60_000),
      headers: { Accept: "image/*" },
    });
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status}`);
    }

    const headerType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    const urlExtension = extensionFromUrl(source);
    const contentType =
      headerType in EXTENSION_BY_CONTENT_TYPE
        ? headerType
        : urlExtension
          ? CONTENT_TYPE_BY_EXTENSION[urlExtension]!
          : "image/webp";
    const extension = EXTENSION_BY_CONTENT_TYPE[contentType] ?? urlExtension ?? "webp";

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) throw new Error("Downloaded image is empty.");

    const path = `flux/${randomUUID()}.${extension}`;
    const upload = await supabase.storage.from(CREATIVES_BUCKET).upload(path, buffer, {
      contentType,
      cacheControl: "31536000",
      upsert: false,
    });
    if (upload.error) throw new Error(upload.error.message);

    const { data } = supabase.storage.from(CREATIVES_BUCKET).getPublicUrl(path);
    if (!data.publicUrl) throw new Error("Supabase did not return a public URL.");
    return data.publicUrl;
  } catch (error) {
    console.error(
      "[creative-storage] persist failed, keeping source URL",
      source,
      error instanceof Error ? error.message : error,
    );
    return source;
  }
}

/** Download + upload several images in parallel (split styles: before/after). */
export async function persistCreativeImages(sourceUrls: string[]): Promise<string[]> {
  return Promise.all(sourceUrls.map((url) => persistCreativeImage(url)));
}
