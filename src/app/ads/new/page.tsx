import type { Metadata } from "next";

import { AdProjectWizard } from "@/components/ad-project-wizard";
import { PageFrame } from "@/components/page-frame";

export const metadata: Metadata = {
  title: "Новая AI-кампания",
};

export default function NewAdProjectPage() {
  return (
    <PageFrame
      eyebrow="AI-Кампании"
      title="Новый проект"
      description="Ответьте на вопросы ИИ или загрузите таблицу, затем выберите визуальный стиль."
    >
      <AdProjectWizard />
    </PageFrame>
  );
}
