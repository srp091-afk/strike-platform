import "server-only";

import { cache } from "react";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const getAuthenticatedUserId = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Нужно войти через Google.");
  }

  const metadata = data.user.user_metadata;
  const fullName =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    data.user.email ||
    "STRIKE";

  const admin = createSupabaseAdminClient();
  const { error: profileError } = await admin.from("profiles").upsert(
    { id: data.user.id, full_name: fullName },
    { onConflict: "id", ignoreDuplicates: true },
  );

  if (profileError) {
    throw new Error(profileError.message);
  }

  return data.user.id;
});
