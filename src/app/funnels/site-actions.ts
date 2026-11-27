"use server";

import { revalidatePath } from "next/cache";

import { getEffectiveUserId } from "@/lib/account-context";
import { blankQuiz, type AnalyticsConfig, type QuizSchema, type SeoConfig, type ThemeConfig, type ThemePreset } from "@/lib/sites/quiz-schema";
import { createBlankLanding, createQuizSite, getOwnedSite, publishQuiz, saveQuizDraft } from "@/lib/sites/store";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function createManualQuiz(title: string, preset: ThemePreset = "dark_premium") {
  const site = await createQuizSite({
    title: title.trim() || "Квиз",
    subtitle: "",
    prompt: "",
    schema: blankQuiz(title.trim() || "Квиз"),
    preset,
    agentId: null,
  });
  revalidatePath("/funnels");
  return { id: site.id };
}

export async function createManualLanding(title: string, preset: ThemePreset = "dark_premium") {
  const site = await createBlankLanding({ title: title.trim() || "Новый лендинг", preset });
  revalidatePath("/funnels");
  return { id: site.id };
}

export async function saveQuiz(id: string, patch: {
  title: string;
  subdomain: string;
  customDomain: string;
  theme: ThemeConfig;
  draft: QuizSchema;
  analytics: AnalyticsConfig;
  seo: SeoConfig;
  agentId: string | null;
}) {
  try {
    await saveQuizDraft(id, {
      ...patch,
      customDomain: patch.customDomain.trim() ? patch.customDomain.trim().toLowerCase() : null,
    });
    return { ok: true as const, error: null };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Не удалось сохранить." };
  }
}

export async function publishQuizSite(id: string) {
  try {
    await publishQuiz(id);
    revalidatePath("/funnels");
    revalidatePath(`/funnels/${id}`);
    return { ok: true as const, error: null };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Не удалось опубликовать." };
  }
}

export async function duplicateSite(id: string) {
  const site = await getOwnedSite(id);
  if (!site) return { ok: false as const, error: "Сайт не найден.", id: null };
  const copy = await createQuizSite({
    title: `${site.title} копия`.slice(0, 160),
    subtitle: site.subtitle,
    prompt: "",
    schema: site.draft,
    preset: site.theme.preset,
    agentId: site.agentId,
  });
  revalidatePath("/funnels");
  return { ok: true as const, error: null, id: copy.id };
}

export async function deleteSite(id: string) {
  const userId = await getEffectiveUserId();
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("landings").delete().eq("id", id).eq("user_id", userId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/funnels");
  return { ok: true as const, error: null };
}

export async function listSubmissions(id: string) {
  const site = await getOwnedSite(id);
  if (!site) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("site_submissions")
    .select("id, contact_name, contact_phone, contact_email, preferred_messenger, answers, calculated_result, created_at")
    .eq("site_id", id)
    .eq("user_id", site.userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    const fallback = await admin
      .from("site_submissions")
      .select("id, contact_name, contact_phone, contact_email, preferred_messenger, answers, created_at")
      .eq("site_id", id)
      .eq("user_id", site.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    return (fallback.data ?? []).map((row) => ({ ...row, calculated_result: null }));
  }
  return data ?? [];
}
