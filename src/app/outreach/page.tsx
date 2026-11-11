import type { Metadata } from "next";

import { OutreachPageClient } from "@/components/outreach/outreach-page-client";

export const metadata: Metadata = {
  title: "Лидогенерация",
};

export default function OutreachPage() {
  return <OutreachPageClient />;
}
