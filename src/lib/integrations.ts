import "server-only";

import { getExistingWorkspaceUserId } from "@/lib/agents";
import {
  isIntegrationProvider,
  type IntegrationProvider,
  type IntegrationView,
} from "@/lib/integration-catalog";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function listIntegrations(): Promise<IntegrationView[]> {
  const supabase = createSupabaseAdminClient();
  const userId = await getExistingWorkspaceUserId();
  if (!userId) return [];

  const { data, error } = await supabase
    .from("integrations")
    .select("id, provider, agent_id, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const newest = new Map<IntegrationProvider, { id: string; agentId: string | null; active: boolean }>();

  for (const row of data ?? []) {
    if (!isIntegrationProvider(row.provider) || newest.has(row.provider)) continue;
    newest.set(row.provider, {
      id: row.id as string,
      agentId: (row.agent_id as string | null) ?? null,
      active: row.status === "connected",
    });
  }

  const ids = [...newest.values()].map((row) => row.id);
  const withSecrets = new Set<string>();

  if (ids.length > 0) {
    const { data: secrets, error: secretsError } = await supabase
      .from("integration_secrets")
      .select("integration_id, credentials")
      .in("integration_id", ids);

    if (secretsError) {
      throw new Error(secretsError.message);
    }

    for (const secret of secrets ?? []) {
      if (hasStoredCredentials(secret.credentials)) {
        withSecrets.add(secret.integration_id as string);
      }
    }
  }

  return [...newest.entries()].map(([provider, row]) => ({
    id: row.id,
    provider,
    agentId: row.agentId,
    active: row.active,
    hasCredentials: withSecrets.has(row.id),
  }));
}

function hasStoredCredentials(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).some((entry) => typeof entry === "string" && entry.trim().length > 0);
}
