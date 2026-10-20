import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export type CreativeTemplate = {
  id: string;
  name: string;
  category: string;
  preview_url: string;
};

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
