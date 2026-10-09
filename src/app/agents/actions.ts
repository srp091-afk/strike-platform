"use server";

import { revalidatePath } from "next/cache";

import { isAgentModel } from "@/lib/agent-models";
import { getWorkspaceUserId } from "@/lib/agents";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type SaveState = {
  ok: boolean;
  error: string | null;
  savedId: string | null;
};

function readAgentFields(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const systemPrompt = String(formData.get("system_prompt") ?? "").trim();
  const model = String(formData.get("model") ?? "").trim();
  const temperature = Number(formData.get("temperature") ?? 0.7);
  const id = String(formData.get("id") ?? "").trim();

  if (!name) {
    return { ok: false as const, error: "Укажи имя агента." };
  }

  if (!systemPrompt) {
    return { ok: false as const, error: "Нужна системная инструкция." };
  }

  if (!isAgentModel(model)) {
    return { ok: false as const, error: "Выбери модель из списка." };
  }

  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    return { ok: false as const, error: "Температура должна быть от 0 до 2." };
  }

  return {
    ok: true as const,
    id,
    name,
    systemPrompt,
    model,
    temperature,
  };
}

export async function saveAgent(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const fields = readAgentFields(formData);
  if (!fields.ok) {
    return { ok: false, error: fields.error, savedId: null };
  }

  try {
    const supabase = createSupabaseAdminClient();
    const userId = await getWorkspaceUserId();
    const payload = {
      name: fields.name,
      system_prompt: fields.systemPrompt,
      model: fields.model,
      temperature: fields.temperature,
      user_id: userId,
    };

    if (fields.id) {
      const { data, error } = await supabase
        .from("agents")
        .update(payload)
        .eq("id", fields.id)
        .eq("user_id", userId)
        .select("id")
        .maybeSingle();

      if (error) {
        return { ok: false, error: error.message, savedId: null };
      }

      if (!data) {
        return { ok: false, error: "Агент не найден.", savedId: null };
      }
    } else {
      const { error } = await supabase.from("agents").insert(payload);
      if (error) {
        return { ok: false, error: error.message, savedId: null };
      }
    }

    revalidatePath("/");
    revalidatePath("/agents");
    return { ok: true, error: null, savedId: crypto.randomUUID() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось сохранить агента.",
      savedId: null,
    };
  }
}

export async function deleteAgent(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const userId = await getWorkspaceUserId();
  const { error } = await supabase.from("agents").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/");
  revalidatePath("/agents");
}
