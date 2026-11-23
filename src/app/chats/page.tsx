import type { Metadata } from "next";
import { Suspense } from "react";

import { ChatsPageClient } from "@/components/chats-page-client";
import { creditsAreExhausted } from "@/components/credits-notice";

export const metadata: Metadata = {
  title: "Чаты",
};

export default async function ChatsPage() {
  const creditsExhausted = await creditsAreExhausted();
  return (
    <Suspense fallback={null}>
      <ChatsPageClient creditsExhausted={creditsExhausted} />
    </Suspense>
  );
}
