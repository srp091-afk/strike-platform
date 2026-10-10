"use server";

import { revalidatePath } from "next/cache";

import { getLanding, saveLanding } from "@/lib/landings";
import type { LandingDocument } from "@/lib/landing-types";

export async function saveLandingDraft(input: {
  id: string;
  title: string;
  subtitle: string;
  agentId: string | null;
  captureMode: "chat" | "quiz";
  welcomeMessage: string;
  successMessage: string;
  document: LandingDocument;
}) {
  const existing = await getLanding(input.id);
  if (!existing) return { ok: false as const, error: "Воронка не найдена.", landing: null };

  try {
    const landing = await saveLanding({
      id: input.id,
      title: input.title.trim() || existing.title,
      subtitle: input.subtitle,
      agentId: input.agentId,
      captureMode: input.captureMode,
      welcomeMessage: input.welcomeMessage,
      successMessage: input.successMessage,
      document: input.document,
    });
    revalidatePath("/funnels");
    revalidatePath(`/l/${landing.slug}`);
    return { ok: true as const, error: null, landing };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Не удалось сохранить.",
      landing: null,
    };
  }
}
