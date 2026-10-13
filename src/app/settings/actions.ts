"use server";

import { revalidatePath } from "next/cache";

import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type NameState = {
  ok: boolean;
  error: string | null;
  savedName: string | null;
};

export async function updateDisplayName(_prev: NameState, formData: FormData): Promise<NameState> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) {
    return { ok: false, error: "Введите имя.", savedName: null };
  }
  if (displayName.length > 80) {
    return { ok: false, error: "Имя не длиннее 80 символов.", savedName: null };
  }

  try {
    const userId = await getAuthenticatedUserId();
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from("profiles").update({ full_name: displayName }).eq("id", userId);
    if (error) {
      return { ok: false, error: error.message, savedName: null };
    }

    revalidatePath("/settings");
    revalidatePath("/", "layout");
    return { ok: true, error: null, savedName: displayName };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось сохранить имя.",
      savedName: null,
    };
  }
}
