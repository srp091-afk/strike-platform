import type { Metadata } from "next";

import { LandingView } from "@/components/landing/landing-view";

export const metadata: Metadata = {
  title: "STRIKE — AI-агенты для продаж и поддержки",
  description:
    "Создавайте AI-агентов, квалифицируйте лидов и запускайте AI-кампании во всех каналах. Платформа автоматизации STRIKE.",
};

export default function HomePage() {
  return <LandingView />;
}
