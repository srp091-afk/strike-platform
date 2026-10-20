import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type CreativeTemplate = {
  id: string;
  name: string;
  category: string;
  preview_url: string;
};

/**
 * `system_prompt` per template id (used as the style master prompt during
 * generation). Missing/empty prompts fall back to the built-in studio
 * master prompts, so this never blocks generation.
 */
export async function getCreativeTemplatePrompts(
  ids: string[],
): Promise<Map<string, { name: string; systemPrompt: string }>> {
  const unique = [...new Set(ids.map((id) => id.trim().toLowerCase()).filter(Boolean))];
  const prompts = new Map<string, { name: string; systemPrompt: string }>();
  if (unique.length === 0) return prompts;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("creative_templates")
    .select("id, name, system_prompt")
    .eq("is_active", true)
    .in("id", unique);

  if (error) {
    console.error("[creative-templates] prompts", error.message);
    return prompts;
  }
  for (const row of data ?? []) {
    const id = typeof row.id === "string" ? row.id.toLowerCase() : "";
    if (!id) continue;
    prompts.set(id, {
      name: typeof row.name === "string" ? row.name.trim() : "",
      systemPrompt: typeof row.system_prompt === "string" ? row.system_prompt.trim() : "",
    });
  }
  return prompts;
}

export async function listCreativeTemplates(): Promise<CreativeTemplate[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("creative_templates")
    .select("id, name, category, preview_url")
    .eq("is_active", true)
    // Seeded style UUIDs are sequential (...0001–...0005): id order = style order.
    .order("id");

  if (error) throw new Error(error.message);

  return (data ?? []).flatMap((row) => {
    const id = typeof row.id === "string" ? row.id : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const category = typeof row.category === "string" ? row.category.trim() : "";
    const previewUrl = typeof row.preview_url === "string" ? row.preview_url : "";
    if (!id || !name) return [];
    return [{ id, name, category: category || "Без категории", preview_url: previewUrl }];
  });
}
