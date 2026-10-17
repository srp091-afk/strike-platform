import type { Metadata } from "next";
import { io } from "next/cache";
import Link from "next/link";
import { Suspense } from "react";

import { CampaignDashboard, type ProjectStatus } from "@/components/campaign-dashboard";
import { getAuthenticatedUserId } from "@/lib/auth-user";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const metadata: Metadata = {
  title: "AI-кампания",
};

const mockStrategy =
  "Ремонт квартир под ключ в Казани для семей, которые купили жильё в новостройке и не хотят жить на стройке полгода. Оффер: белый ключ за 90 дней, смета фиксируется в договоре, неустойка 1 000 ₽ за каждый день просрочки.";

const mockCreatives = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&h=1000&q=70",
  "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&h=1000&q=70",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&h=1000&q=70",
  "https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=800&h=1000&q=70",
];

export default function AdProjectPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="mx-auto h-80 max-w-7xl px-6 py-10" />}>
      <AdProjectResult params={params} />
    </Suspense>
  );
}

async function AdProjectResult({ params }: { params: Promise<{ id: string }> }) {
  await io();
  const { id } = await params;

  let project: { name: string; strategy: string; status: ProjectStatus } | null = null;
  let creatives: { id: string; imageUrl: string }[] = [];
  let error: string | null = null;

  try {
    const loaded = await loadProject(id);
    project = loaded.project;
    creatives = loaded.creatives;
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Не удалось загрузить проект.";
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-10">
        <Link href="/ads" className="text-sm text-zinc-400 hover:text-white">
          ← Все кампании
        </Link>
        <p className="mt-6 rounded-xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-200">{error}</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 py-10">
        <Link href="/ads" className="text-sm text-zinc-400 hover:text-white">
          ← Все кампании
        </Link>
        <p className="mt-6 text-sm text-zinc-400">Проект не найден.</p>
      </div>
    );
  }

  return (
    <CampaignDashboard
      name={project.name}
      strategy={project.strategy}
      status={project.status}
      creatives={creatives}
    />
  );
}

function readStatus(value: unknown): ProjectStatus {
  if (value === "processing" || value === "error" || value === "ready") return value;
  return "ready";
}

async function loadProject(id: string) {
  const userId = await getAuthenticatedUserId();
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("ad_projects")
    .select("id, name, status")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { project: null, creatives: [] as { id: string; imageUrl: string }[] };

  const creativesResult = await supabase
    .from("ad_creatives")
    .select("id, image_url")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  if (creativesResult.error) throw new Error(creativesResult.error.message);

  const stored = (creativesResult.data ?? []).flatMap((row) => {
    const imageUrl = typeof row.image_url === "string" ? row.image_url.trim() : "";
    if (!imageUrl) return [];
    return [{ id: String(row.id), imageUrl }];
  });

  return {
    project: {
      name: typeof data.name === "string" && data.name.trim() ? data.name : "Без названия",
      strategy: mockStrategy,
      status: readStatus(data.status),
    },
    creatives: stored.length > 0 ? stored : mockCreatives.map((imageUrl, index) => ({ id: `mock-${index}`, imageUrl })),
  };
}
