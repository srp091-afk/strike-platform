import type { Metadata } from "next";

import { OutreachPageClient } from "@/components/outreach/outreach-page-client";

export const metadata: Metadata = {
  title: "Рассылки",
};

export default function OutreachPage() {
  return <OutreachPageClient />;
}
