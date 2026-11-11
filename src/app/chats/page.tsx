import type { Metadata } from "next";
import { Suspense } from "react";

import { ChatsPageClient } from "@/components/chats-page-client";

export const metadata: Metadata = {
  title: "Чаты",
};

export default function ChatsPage() {
  return (
    <Suspense fallback={null}>
      <ChatsPageClient />
    </Suspense>
  );
}
