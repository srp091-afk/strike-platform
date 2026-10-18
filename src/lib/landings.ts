import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import {
  LANDING_SECTION_TYPES,
  emptyDocument,
  type LandingDocument,
  type LandingItem,
  type LandingListItem,
  type LandingRecord,
  type LandingSection,
  type LandingSectionType,
} from "@/lib/landing-types";

export type { LandingListItem };

const TRANSLIT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

export function slugifyLanding(value: string) {
  const latin = value
    .trim()
    .toLowerCase()
    .split("")
    .map((char) => TRANSLIT[char] ?? char)
    .join("");
  const slug = latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "landing";
}

/** List preview without heavy `bullets` JSON documents. */
export async function listLandingsPreview(): Promise<LandingListItem[]> {
  const supabase = createSupabaseAdminClient();
  const withStatus = await supabase
    .from("landings")
    .select("id, title, subtitle, created_at, agents(name), status:bullets->>status")
    .order("created_at", { ascending: false });

  if (!withStatus.error) {
    return (withStatus.data ?? []).map((row) => mapLandingPreview(row as Record<string, unknown>));
  }

  const basic = await supabase
    .from("landings")
    .select("id, title, subtitle, created_at, agents(name)")
    .order("created_at", { ascending: false });

  if (basic.error) throw new Error(basic.error.message);
  return (basic.data ?? []).map((row) => mapLandingPreview(row as Record<string, unknown>));
}

export async function listLandings(): Promise<LandingRecord[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("landings")
    .select("id, slug, title, subtitle, image_url, agent_id, capture_mode, welcome_message, success_message, bullets, created_at, agents(name)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapLanding(row));
}

function mapLandingPreview(row: Record<string, unknown>): LandingListItem {
  const agent = Array.isArray(row.agents) ? row.agents[0] : row.agents;
  const agentName =
    agent && typeof agent === "object" && "name" in agent && typeof agent.name === "string" ? agent.name : null;
  const statusRaw = typeof row.status === "string" ? row.status : null;

  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    subtitle: String(row.subtitle ?? ""),
    createdAt: String(row.created_at ?? ""),
    agentName,
    status: statusRaw === "published" ? "published" : "draft",
  };
}

export async function getLanding(id: string): Promise<LandingRecord | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("landings")
    .select("id, slug, title, subtitle, image_url, agent_id, capture_mode, welcome_message, success_message, bullets, created_at, agents(name)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapLanding(data) : null;
}

export async function getLandingBySlug(slug: string): Promise<LandingRecord | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("landings")
    .select("id, slug, title, subtitle, image_url, agent_id, capture_mode, welcome_message, success_message, bullets, created_at, agents(name)")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapLanding(data) : null;
}

export async function saveLanding(input: {
  id?: string;
  title: string;
  subtitle: string;
  agentId: string | null;
  captureMode: "chat" | "quiz";
  welcomeMessage: string;
  successMessage: string;
  document: LandingDocument;
}) {
  const supabase = createSupabaseAdminClient();
  const row = {
    title: input.title.slice(0, 160),
    subtitle: input.subtitle.slice(0, 280),
    agent_id: input.agentId,
    capture_mode: input.captureMode,
    welcome_message: input.welcomeMessage.slice(0, 1000),
    success_message: input.successMessage.slice(0, 1000),
    bullets: input.document,
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("landings")
      .update(row)
      .eq("id", input.id)
      .select("id, slug, title, subtitle, image_url, agent_id, capture_mode, welcome_message, success_message, bullets, created_at, agents(name)")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Не удалось сохранить воронку.");
    return mapLanding(data);
  }

  const slug = await uniqueSlug(input.title);
  const { data, error } = await supabase
    .from("landings")
    .insert({ ...row, slug })
    .select("id, slug, title, subtitle, image_url, agent_id, capture_mode, welcome_message, success_message, bullets, created_at, agents(name)")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось создать воронку.");
  return mapLanding(data);
}

async function uniqueSlug(title: string) {
  const supabase = createSupabaseAdminClient();
  const base = slugifyLanding(title);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data, error } = await supabase.from("landings").select("id").eq("slug", slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function mapLanding(row: Record<string, unknown>): LandingRecord {
  const agent = Array.isArray(row.agents) ? row.agents[0] : row.agents;
  const agentName =
    agent && typeof agent === "object" && "name" in agent && typeof agent.name === "string" ? agent.name : null;

  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title ?? ""),
    subtitle: String(row.subtitle ?? ""),
    imageUrl: typeof row.image_url === "string" ? row.image_url : null,
    agentId: typeof row.agent_id === "string" ? row.agent_id : null,
    agentName,
    captureMode: row.capture_mode === "quiz" ? "quiz" : "chat",
    welcomeMessage: String(row.welcome_message ?? ""),
    successMessage: String(row.success_message ?? ""),
    document: readDocument(row.bullets),
    createdAt: String(row.created_at ?? ""),
  };
}

export function readDocument(value: unknown): LandingDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyDocument();
  const record = value as Record<string, unknown>;
  const theme = record.theme;
  const themeRecord = theme && typeof theme === "object" ? (theme as Record<string, unknown>) : {};
  const sections = Array.isArray(record.sections) ? record.sections.flatMap(readSection) : [];

  return {
    prompt: typeof record.prompt === "string" ? record.prompt : "",
    status: record.status === "published" ? "published" : "draft",
    theme: {
      accent: hexColor(themeRecord.accent, "#E11D48"),
      background: hexColor(themeRecord.background, "#F8FAFC"),
      foreground: hexColor(themeRecord.foreground, "#09090B"),
    },
    sections,
  };
}

function readSection(value: unknown): LandingSection[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const type = LANDING_SECTION_TYPES.find((item) => item === record.type);
  if (!type) return [];
  return [{ type, content: readContent(record.content) }];
}

function readContent(value: unknown): LandingSection["content"] {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const items = Array.isArray(record.items) ? record.items.flatMap(readItem) : [];
  return {
    eyebrow: text(record.eyebrow),
    headline: text(record.headline),
    text: text(record.text),
    primaryCta: text(record.primaryCta),
    secondaryCta: text(record.secondaryCta),
    items,
  };
}

function readItem(value: unknown): LandingItem[] {
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [{ title: text(record.title), text: text(record.text), meta: text(record.meta) }];
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function hexColor(value: unknown, fallback: string) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

export function isSectionType(value: string): value is LandingSectionType {
  return LANDING_SECTION_TYPES.some((type) => type === value);
}
