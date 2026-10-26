import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Политика конфиденциальности",
  description: "Как STRIKE собирает, использует и защищает персональные данные.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Политика конфиденциальности" updated="—">
      <p>Текст политики конфиденциальности будет опубликован здесь.</p>
    </LegalPage>
  );
}
