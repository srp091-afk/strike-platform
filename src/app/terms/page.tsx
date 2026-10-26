import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Пользовательское соглашение",
  description: "Условия использования платформы STRIKE.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Пользовательское соглашение" updated="—">
      <p>Текст пользовательского соглашения будет опубликован здесь.</p>
    </LegalPage>
  );
}
