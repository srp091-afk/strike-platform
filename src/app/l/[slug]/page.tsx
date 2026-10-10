import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { io } from "next/cache";

import { LandingView } from "@/components/landing-view";
import { getLandingBySlug } from "@/lib/landings";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const landing = await getLandingBySlug(slug);
  return { title: landing?.title ?? "Лендинг" };
}

export default function PublicLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F8FAFC]" />}>
      <PublicLanding params={params} />
    </Suspense>
  );
}

async function PublicLanding({ params }: { params: Promise<{ slug: string }> }) {
  await io();
  const { slug } = await params;
  const landing = await getLandingBySlug(slug);
  if (!landing) notFound();

  return (
    <main className="min-h-screen" style={{ background: landing.document.theme.background }}>
      <LandingView landing={landing} />
    </main>
  );
}
