import "server-only";

import { getEffectiveUserId } from "@/lib/account-context";
import { hostName, isCustomSiteHost, normalizeSubdomain, subdomainFromHost } from "@/lib/sites/domains";
import {
  blankQuiz,
  defaultTheme,
  emptyAnalytics,
  emptySeo,
  parseAnalytics,
  parseQuizSchema,
  parseSeo,
  parseTheme,
  type AnalyticsConfig,
  type QuizSchema,
  type SeoConfig,
  type ThemeConfig,
  type ThemePreset,
} from "@/lib/sites/quiz-schema";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const SITE_COLUMNS =
  "id, user_id, slug, title, subtitle, site_type, subdomain, custom_domain, domain_status, status, theme_config, draft_schema, published_schema, published_at, analytics_config, seo_config, agent_id, views_count, starts_count, leads_count, created_at, agents(name)";

export type SiteRecord = {
  id: string;
  userId: string;
  slug: string;
  title: string;
  subtitle: string;
  siteType: string;
  subdomain: string | null;
  customDomain: string | null;
  domainStatus: string;
  status: "draft" | "published" | "paused";
  theme: ThemeConfig;
  draft: QuizSchema;
  published: QuizSchema | null;
  analytics: AnalyticsConfig;
  seo: SeoConfig;
  agentId: string | null;
  agentName: string | null;
  views: number;
  starts: number;
  leads: number;
  createdAt: string;
};

export async function createQuizSite(input: {
  title: string;
  subtitle: string;
  prompt: string;
  schema: QuizSchema;
  preset: ThemePreset;
  agentId: string | null;
  subdomain?: string;
}) {
  const userId = await getEffectiveUserId();
  const admin = createSupabaseAdminClient();
  const subdomain = await claimSubdomain(admin, input.subdomain || input.title);
  const theme = defaultTheme(input.preset);
  const { data, error } = await admin
    .from("landings")
    .insert({
      user_id: userId,
      slug: subdomain,
      title: input.title.slice(0, 160),
      subtitle: input.subtitle.slice(0, 280),
      site_type: "quiz",
      subdomain,
      status: "draft",
      theme_config: theme,
      draft_schema: input.schema,
      analytics_config: { ...emptyAnalytics() },
      seo_config: emptySeo(input.title),
      agent_id: input.agentId,
      capture_mode: "quiz",
      welcome_message: "",
      success_message: "",
      bullets: { prompt: input.prompt, status: "draft", theme: { accent: theme.accentColor, background: "#0A0A0C", foreground: "#F4F4F5" }, sections: [] },
    })
    .select(SITE_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? "Не удалось создать квиз.");
  return mapSite(data);
}

export async function getOwnedSite(id: string) {
  const userId = await getEffectiveUserId();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("landings").select(SITE_COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapSite(data) : null;
}

export async function saveQuizDraft(id: string, patch: {
  title?: string;
  subdomain?: string;
  customDomain?: string | null;
  theme?: ThemeConfig;
  draft?: QuizSchema;
  analytics?: AnalyticsConfig;
  seo?: SeoConfig;
  agentId?: string | null;
}) {
  const current = await getOwnedSite(id);
  if (!current || current.siteType !== "quiz") throw new Error("Квиз не найден.");
  const admin = createSupabaseAdminClient();
  const row: Record<string, unknown> = {};
  if (patch.title) row.title = patch.title.slice(0, 160);
  if (patch.theme) row.theme_config = patch.theme;
  if (patch.draft) row.draft_schema = patch.draft;
  if (patch.analytics) row.analytics_config = patch.analytics;
  if (patch.seo) row.seo_config = patch.seo;
  if (patch.agentId !== undefined) row.agent_id = patch.agentId;
  if (patch.subdomain && patch.subdomain !== current.subdomain) {
    const normalized = normalizeSubdomain(patch.subdomain);
    if (!normalized.ok) throw new Error(normalized.reason);
    const free = await subdomainFree(admin, normalized.slug, id);
    if (!free) throw new Error("Этот субдомен уже занят.");
    row.subdomain = normalized.slug;
    row.slug = normalized.slug;
  }
  if (patch.customDomain !== undefined && patch.customDomain !== current.customDomain) {
    row.custom_domain = patch.customDomain;
    row.domain_status = patch.customDomain ? "pending_dns" : "subdomain_only";
  }
  const { error } = await admin.from("landings").update(row).eq("id", id).eq("user_id", current.userId);
  if (error) throw new Error(error.message);
  return getOwnedSite(id);
}

export async function publishQuiz(id: string) {
  const current = await getOwnedSite(id);
  if (!current) throw new Error("Квиз не найден.");
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("landings")
    .update({
      published_schema: current.draft,
      status: "published",
      published_at: new Date().toISOString(),
      seo_config: { ...current.seo, title: current.seo.title || current.title },
    })
    .eq("id", id)
    .eq("user_id", current.userId);
  if (error) throw new Error(error.message);
}

export async function getPublishedByHost(host: string) {
  const admin = createSupabaseAdminClient();
  const sub = subdomainFromHost(host);
  const column = sub ? "subdomain" : isCustomSiteHost(host) ? "custom_domain" : "";
  const value = sub || hostName(host);
  if (!column) return null;
  const { data, error } = await admin.from("landings").select(SITE_COLUMNS).eq(column, value).maybeSingle();
  if (error || !data) return null;
  const site = mapSite(data);
  if (site.status !== "published") return { site, live: false as const };
  return { site, live: true as const };
}

export async function getPublishedBySubdomain(subdomain: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from("landings").select(SITE_COLUMNS).eq("subdomain", subdomain).maybeSingle();
  if (error || !data) return null;
  const site = mapSite(data);
  return { site, live: site.status === "published" };
}

async function claimSubdomain(admin: ReturnType<typeof createSupabaseAdminClient>, raw: string) {
  const normalized = normalizeSubdomain(raw);
  const base = normalized.ok ? normalized.slug : "quiz-site";
  for (let index = 0; index < 8; index += 1) {
    const slug = index === 0 ? base : `${base.slice(0, 36)}-${index + 1}`;
    const check = normalizeSubdomain(slug);
    if (!check.ok) continue;
    if (await subdomainFree(admin, check.slug)) return check.slug;
  }
  const stamp = Date.now().toString(36).slice(-6);
  const fallback = normalizeSubdomain(`quiz-${stamp}`);
  return fallback.ok ? fallback.slug : `quiz${stamp}`;
}

async function subdomainFree(admin: ReturnType<typeof createSupabaseAdminClient>, slug: string, exceptId?: string) {
  const { data, error } = await admin.from("landings").select("id").eq("subdomain", slug).maybeSingle();
  if (error) throw new Error(error.message);
  return !data || data.id === exceptId;
}

function mapSite(row: Record<string, unknown>): SiteRecord {
  const agent = Array.isArray(row.agents) ? row.agents[0] : row.agents;
  const agentName = agent && typeof agent === "object" && "name" in agent && typeof agent.name === "string" ? agent.name : null;
  const title = String(row.title ?? "Квиз");
  const draft = parseQuizSchema(row.draft_schema ?? blankQuiz(title));
  const publishedRaw = row.published_schema;
  return {
    id: String(row.id),
    userId: String(row.user_id ?? ""),
    slug: String(row.slug ?? ""),
    title,
    subtitle: String(row.subtitle ?? ""),
    siteType: String(row.site_type ?? "landing"),
    subdomain: typeof row.subdomain === "string" ? row.subdomain : null,
    customDomain: typeof row.custom_domain === "string" ? row.custom_domain : null,
    domainStatus: String(row.domain_status ?? "subdomain_only"),
    status: row.status === "published" || row.status === "paused" ? row.status : "draft",
    theme: parseTheme(row.theme_config),
    draft,
    published: publishedRaw ? parseQuizSchema(publishedRaw) : null,
    analytics: parseAnalytics(row.analytics_config),
    seo: parseSeo(row.seo_config, title),
    agentId: typeof row.agent_id === "string" ? row.agent_id : null,
    agentName,
    views: Number(row.views_count ?? 0) || 0,
    starts: Number(row.starts_count ?? 0) || 0,
    leads: Number(row.leads_count ?? 0) || 0,
    createdAt: String(row.created_at ?? ""),
  };
}
